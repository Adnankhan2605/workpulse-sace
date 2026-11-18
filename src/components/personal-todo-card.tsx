import React, { useState, useEffect } from "react";
import { CheckSquare, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/lib/store";

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export default function PersonalTodoCard() {
  const { me } = useApp();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [inputText, setInputText] = useState("");

  const storageKey = me ? `sace_todos_${me.id}` : null;

  useEffect(() => {
    if (!storageKey) {
      setTodos([]);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setTodos(JSON.parse(saved));
      } else {
        const initial: TodoItem[] = [
          {
            id: "1",
            text: "Review daily schedule & team sync",
            completed: false,
            createdAt: new Date().toISOString(),
          },
          {
            id: "2",
            text: "Submit end-of-day report & proofs",
            completed: false,
            createdAt: new Date().toISOString(),
          },
        ];
        setTodos(initial);
        localStorage.setItem(storageKey, JSON.stringify(initial));
      }
    } catch {
      setTodos([]);
    }
  }, [storageKey]);

  const saveTodos = (updated: TodoItem[]) => {
    setTodos(updated);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !inputText.trim()) return;
    const newItem: TodoItem = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
      text: inputText.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    saveTodos([newItem, ...todos]);
    setInputText("");
  };

  const toggleTodo = (id: string) => {
    const updated = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    saveTodos(updated);
  };

  const deleteTodo = (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    saveTodos(updated);
  };

  if (!me) return null;

  const remainingCount = todos.filter((t) => !t.completed).length;

  return (
    <Card className="rounded-2xl border bg-card shadow-xs flex flex-col justify-between h-full">
      <CardHeader className="pb-3 pt-5 px-5 flex flex-row items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <CheckSquare className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold">Personal To-Do List</CardTitle>
            <p className="text-[11px] text-muted-foreground">Private daily checklist</p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {remainingCount} remaining
        </span>
      </CardHeader>

      <CardContent className="p-5 flex flex-col justify-between flex-1 space-y-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Add a new personal task..."
            className="text-xs h-9 flex-1"
            maxLength={120}
          />
          <Button type="submit" size="sm" className="h-9 px-3 text-xs gap-1 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </form>

        <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20">
          {todos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No personal tasks yet. Add one above!
            </p>
          ) : (
            todos.map((item) => (
              <div
                key={item.id}
                className="group flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/30 px-3 py-2 text-xs transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleTodo(item.id)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      item.completed
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40 bg-background hover:border-primary"
                    }`}
                  >
                    {item.completed && <Check className="h-3 w-3 stroke-[3]" />}
                  </button>
                  <span
                    className={`truncate font-medium ${
                      item.completed ? "line-through text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {item.text}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteTodo(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 p-1"
                  title="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
