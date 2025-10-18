from __future__ import annotations

import asyncio
from functools import lru_cache

from loguru import logger
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion

from app.core.config import get_settings


class AIServiceUnavailable(RuntimeError):
    """Raised when the AI service is not configured."""


@lru_cache(maxsize=1)
def _get_async_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise AIServiceUnavailable("OPENAI_API_KEY not configured")
    return AsyncOpenAI(api_key=settings.openai_api_key)


async def _maybe_generate_with_openai(
    *, prompt: str, context: str | None, temperature: float
) -> tuple[str | None, str | None]:
    settings = get_settings()
    if not settings.openai_api_key:
        return None, None

    client = _get_async_client()
    messages: list[dict[str, str]] = [
        {"role": "system", "content": settings.openai_system_prompt},
        {"role": "user", "content": prompt},
    ]
    if context:
        messages.append({"role": "user", "content": context})

    try:
        completion: ChatCompletion = await client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=temperature,
            max_tokens=300,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAI generation failed", exc_info=exc)
        return None, f"OpenAI error: {exc}"

    choice = next((choice for choice in completion.choices if choice.message and choice.message.content), None)
    if not choice or not choice.message or not choice.message.content:
        return None, "OpenAI returned empty response"
    return choice.message.content.strip(), None


async def _maybe_generate_with_gemini(*, prompt: str, context: str | None, temperature: float) -> str | None:
    settings = get_settings()
    if not settings.gemini_api_key:
        return None, None

    def _run() -> str | None:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(model_name=settings.gemini_model)

        pieces = [settings.openai_system_prompt, "User request:", prompt]
        if context:
            pieces.append("Context:")
            pieces.append(context)
        combined = "\n\n".join(pieces)

        response = model.generate_content(combined, generation_config={"temperature": float(temperature)})

        text = getattr(response, "text", None)
        if text:
            return text.strip()
        if response and getattr(response, "candidates", None):
            for candidate in response.candidates:
                if candidate.content and candidate.content.parts:
                    part_text = "".join(getattr(part, "text", "") for part in candidate.content.parts)
                    if part_text:
                        return part_text.strip()
        return None

    try:
        result = await asyncio.to_thread(_run)
        if result:
            return result, None
        return None, "Gemini returned empty response"
    except Exception as exc:  # noqa: BLE001
        logger.warning("Gemini generation failed", exc_info=exc)
        return None, f"Gemini error: {exc}"


async def generate_completion(*, prompt: str, context: str | None = None, temperature: float = 0.7) -> str:
    settings = get_settings()
    errors: list[str] = []

    openai_result, openai_error = await _maybe_generate_with_openai(
        prompt=prompt, context=context, temperature=temperature
    )
    if openai_result:
        return openai_result
    if openai_error:
        errors.append(openai_error)

    gemini_result, gemini_error = await _maybe_generate_with_gemini(
        prompt=prompt, context=context, temperature=temperature
    )
    if gemini_result:
        return gemini_result
    if gemini_error:
        errors.append(gemini_error)

    if settings.openai_api_key or settings.gemini_api_key:
        raise RuntimeError("; ".join(errors) or "AI generation failed")
    raise AIServiceUnavailable("No AI provider configured. Add OPENAI_API_KEY or GEMINI_API_KEY")
