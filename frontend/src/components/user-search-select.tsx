"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { UserSearchResult } from "@/types/api";

type UserSearchSelectProps = {
  value: UserSearchResult | null;
  onChange: (user: UserSearchResult | null) => void;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
};

const formatUserLabel = (user: UserSearchResult) => {
  if (user.full_name) {
    return `${user.full_name} (${user.email})`;
  }
  return user.email;
};

const fetchUsers = async (query: string) => {
  const { data } = await apiClient.get<UserSearchResult[]>("/users/search", {
    params: { q: query },
  });
  return data;
};

export const UserSearchSelect = ({
  value,
  onChange,
  placeholder = "Search by name or email",
  disabled,
  helperText,
}: UserSearchSelectProps) => {
  const [inputValue, setInputValue] = useState<string>(value ? formatUserLabel(value) : "");
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(value ? formatUserLabel(value) : "");
    }
  }, [value, isFocused]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(inputValue.trim());
    }, 200);
    return () => clearTimeout(handle);
  }, [inputValue]);

  const { data: options = [], isFetching, isError } = useQuery({
    queryKey: ["users", "search", debouncedQuery],
    queryFn: () => fetchUsers(debouncedQuery),
    enabled: !disabled && isOpen && debouncedQuery.length >= 2,
  });

  useEffect(() => {
    setHighlightedIndex(0);
  }, [options.length]);

  const handleSelect = (user: UserSearchResult) => {
    onChange(user);
    setInputValue(formatUserLabel(user));
    setIsOpen(false);
    setIsFocused(false);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setInputValue(nextValue);
    setIsOpen(true);
    setIsFocused(true);
    if (value) {
      onChange(null);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      setIsFocused(false);
      if (!value) {
        setInputValue("");
      }
    }, 150);
  };

  const prompt = useMemo(() => {
    if (debouncedQuery.length < 2) {
      return "Type at least 2 characters to search.";
    }
    if (isFetching) {
      return "Searching users...";
    }
    if (isError) {
      return "We couldn’t load users. Try again.";
    }
    if (!options.length) {
      return "No matching users found.";
    }
    return null;
  }, [debouncedQuery.length, isError, isFetching, options.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => (options.length ? Math.min(prev + 1, options.length - 1) : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => (options.length ? Math.max(prev - 1, 0) : 0));
      return;
    }
    if (event.key === "Enter") {
      if (options[highlightedIndex]) {
        event.preventDefault();
        handleSelect(options[highlightedIndex]);
      }
    }
  };

  return (
    <div className="relative">
      <input
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => {
          setIsFocused(true);
          setIsOpen(true);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100"
        autoComplete="off"
      />
      {helperText ? <p className="mt-1 text-xs text-slate-500">{helperText}</p> : null}
      {isOpen ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {prompt ? (
            <div className="px-3 py-2 text-xs text-slate-500">{prompt}</div>
          ) : (
            <ul className="max-h-64 overflow-auto py-1 text-sm">
              {options.map((user, index) => (
                <li
                  key={user.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(user);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-slate-700 hover:bg-slate-100",
                    index === highlightedIndex ? "bg-slate-100" : "",
                  )}
                >
                  <div className="font-medium text-slate-900">{user.full_name ?? user.email}</div>
                  {user.full_name ? <div className="text-xs text-slate-500">{user.email}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};
