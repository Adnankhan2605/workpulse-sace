import React, { useState, useEffect } from "react";

// Curated list of daily motivational & leadership quotes
const dailyQuotes = [
  "Empowering workforce excellence and educational leadership.",
  "Small disciplines repeated with consistency every day lead to great achievements.",
  "Excellence is not an act, but a habit built through daily dedication.",
  "Innovation distinguishes between a leader and a follower.",
  "Focus on being productive instead of busy building impactful systems.",
  "Great things in business are never done by one person; they're done by a team of people.",
  "Success is the sum of small efforts, repeated day in and day out.",
];

export default function DailyVisionCard() {
  const [vision, setVision] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    const savedCustomVision = localStorage.getItem("sace_custom_vision");
    const savedDate = localStorage.getItem("sace_vision_date");
    const todayStr = new Date().toDateString();

    // Only use custom vision if it was explicitly saved today AND isn't leftover test data
    if (savedCustomVision && savedDate === todayStr && savedCustomVision !== "test in4") {
      setVision(savedCustomVision);
    } else {
      // Clear outdated test data and load today's automatic quote
      localStorage.removeItem("sace_custom_vision");
      localStorage.removeItem("sace_vision_date");

      const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % dailyQuotes.length;
      setVision(dailyQuotes[dayIndex]);
    }
  }, []);

  const handleSave = () => {
    if (customInput.trim()) {
      setVision(customInput);
      localStorage.setItem("sace_custom_vision", customInput);
      localStorage.setItem("sace_vision_date", new Date().toDateString());
    }
    setIsEditing(false);
  };

  const handleResetToDaily = () => {
    localStorage.removeItem("sace_custom_vision");
    localStorage.removeItem("sace_vision_date");
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % dailyQuotes.length;
    setVision(dailyQuotes[dayIndex]);
    setIsEditing(false);
  };

  return (
    <div className="bg-[#2D0029] text-white p-6 rounded-2xl shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[140px] max-w-xl">
      {/* Background Decorative Glow */}
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-purple-600/20 rounded-full blur-2xl pointer-events-none"></div>

      {/* Top Header / Icon Area */}
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-purple-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </div>
        <span className="text-xs font-bold tracking-widest uppercase text-purple-300">
          Daily Vision
        </span>
      </div>

      {/* Content Area (Display or Edit Form) */}
      {!isEditing ? (
        <div className="mb-4">
          <p className="text-lg font-medium text-white/95 leading-snug">"{vision}"</p>
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <textarea
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Enter your custom daily vision or quote..."
            className="w-full p-3 bg-purple-950/80 border border-purple-500/40 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none h-20"
            maxLength={180}
          />
          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-white text-[#2D0029] font-semibold rounded-lg hover:bg-purple-100 transition-colors"
            >
              Save Vision
            </button>
            <button
              onClick={handleResetToDaily}
              className="px-3 py-1.5 bg-purple-800/60 text-purple-200 rounded-lg hover:bg-purple-800 transition-colors"
            >
              Reset to Auto-Daily
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-purple-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!isEditing && (
        <div>
          <button
            onClick={() => {
              setCustomInput(vision);
              setIsEditing(true);
            }}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors border border-white/10 flex items-center space-x-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            <span>Edit vision</span>
          </button>
        </div>
      )}
    </div>
  );
}
