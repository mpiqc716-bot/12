import React, { useState, useRef, useEffect } from "react";
import { 
  MessageSquare, 
  Send, 
  Users, 
  Shield, 
  Lock, 
  CheckCircle, 
  AlertTriangle, 
  Wrench,
  HelpCircle,
  Clock,
  Sparkles
} from "lucide-react";
import { User, ChatMessage } from "../types";

interface DiscussionBoardProps {
  currentUser: User | null;
  chatMessages: ChatMessage[];
  activeOperators: { username: string; role: string; lastSeen: string }[];
  onSendMessage: (text: string) => Promise<void>;
  isLoadingHistory?: boolean;
}

function DiscussionBoard({
  currentUser,
  chatMessages = [],
  activeOperators = [],
  onSendMessage,
  isLoadingHistory = false
}: DiscussionBoardProps) {
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Group quick replies tailored for factory operators
  const quickReplies = [
    { text: "Liner steps checked. Approved.", category: "pass", icon: CheckCircle },
    { text: "Need helper on Spigot calibration.", category: "help", icon: Wrench },
    { text: "Dimensions out of bounds! Re-checking.", category: "warning", icon: AlertTriangle },
    { text: "Lot batch cleared for curing.", category: "info", icon: MessageSquare },
  ];

  // Auto-scroll messages list to the bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(inputText);
      setInputText("");
    } catch (err: any) {
      alert("Failed to send message: " + (err.message || err));
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickReply = async (replyText: string) => {
    if (isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(replyText);
    } catch (err: any) {
      alert("Failed to send message: " + (err.message || err));
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  };

  const formatDayDivider = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return "";
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col md:flex-row h-[72vh] min-h-[500px] font-sans">
      
      {/* Sidebar for Active Crew / Presence monitoring */}
      <div className="w-full md:w-64 bg-slate-900 text-gray-100 p-4 shrink-0 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-slate-800">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Users className="w-5 h-5 text-blue-400" />
          <div>
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-white">Active Floor Crew</h3>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              {activeOperators.length} Operators Online
            </span>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto space-y-2.5 max-h-[120px] md:max-h-none scrollbar-thin">
          {activeOperators.map((op, i) => {
            const isSelf = op.username.toLowerCase() === currentUser?.username.toLowerCase();
            return (
              <div 
                key={op.username + i}
                className={`flex items-center justify-between p-2 rounded-xl transition ${
                  isSelf ? "bg-slate-800 border border-slate-700" : "bg-slate-950/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/30 flex items-center justify-center font-bold text-xs text-blue-300">
                    {op.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-bold block truncate max-w-[100px] text-gray-200">
                      {op.username} {isSelf && <span className="text-[9px] text-blue-400 font-medium">(You)</span>}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-black tracking-wide ${
                      op.role === "admin" ? "bg-rose-950 text-rose-300 border border-rose-900" : "bg-slate-800 text-slate-400 border border-slate-755"
                    }`}>
                      {op.role}
                    </span>
                  </div>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
          <div className="flex items-center gap-1 text-white font-bold mb-1">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Industrial Mode</span>
          </div>
          Every dispatch message in this discussion board is archived as permanent QA telemetry and synced across the current inspection terminal.
        </div>
      </div>

      {/* Main chat window container */}
      <div className="flex-grow flex flex-col h-full bg-slate-50 relative">
        
        {/* Banner/Header */}
        <div className="bg-white px-5 py-3.5 border-b border-gray-100 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-gray-800 tracking-wide uppercase">Operator Bulletin & Discussion Board</h4>
              <p className="text-[10px] text-gray-400">Collaborate with active QA technicians on shift</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 bg-blue-50 text-blue-800 font-bold text-[10px] px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-widest leading-none">
            <Sparkles className="w-3 h-3 text-blue-600 animate-spin" />
            Real-time active
          </div>
        </div>

        {/* Message feed stream layout */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          
          {isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center h-full py-10 space-y-2">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
              <span className="text-xs text-gray-500 font-semibold animate-pulse">Syncing chat logs from multi-user ledger...</span>
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center max-w-sm mx-auto space-y-3">
              <div className="p-4 bg-gray-100 rounded-3xl text-gray-400 border border-gray-200">
                <MessageSquare className="w-10 h-10" />
              </div>
              <div>
                <h5 className="font-bold text-gray-800">Operational Bulletin Empty</h5>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  No notifications or messages have been logged on this workspace today. Introduce a query or use active quick replies below to update operators.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {chatMessages.map((msg, index) => {
                const isMyMessage = msg.username.toLowerCase() === currentUser?.username.toLowerCase();
                const showDivider = index === 0 || formatDayDivider(chatMessages[index - 1].timestamp) !== formatDayDivider(msg.timestamp);

                return (
                  <div key={msg.id || index} className="space-y-2">
                    {showDivider && (
                      <div className="flex items-center justify-center my-4">
                        <span className="text-[9px] bg-slate-200 text-slate-600 font-black tracking-widest px-3 py-1 rounded-full uppercase">
                          {formatDayDivider(msg.timestamp)}
                        </span>
                      </div>
                    )}

                    <div className={`flex items-start gap-2 max-w-[85%] ${isMyMessage ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                        isMyMessage 
                          ? "bg-blue-600 text-white" 
                          : msg.role === "admin" 
                          ? "bg-rose-100 text-rose-700 border border-rose-200" 
                          : "bg-slate-200 text-slate-700"
                      }`}>
                        {msg.username.substring(0, 2).toUpperCase()}
                      </div>

                      {/* Bubble */}
                      <div className="space-y-1">
                        <div className={`flex items-center gap-1.5 text-[10px] ${isMyMessage ? "justify-end" : "justify-start"}`}>
                          <span className="font-extrabold text-gray-700">{msg.username}</span>
                          <span className={`px-1 rounded-[4px] uppercase text-[8px] font-black tracking-wide ${
                            msg.role === "admin" ? "bg-rose-100 text-rose-700 border border-rose-200" : "bg-slate-200 text-slate-500"
                          }`}>
                            {msg.role}
                          </span>
                          <span className="text-gray-400 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>

                        <div className={`p-3 rounded-2xl text-xs leading-relaxed font-sans shadow-2xs ${
                          isMyMessage 
                            ? "bg-blue-600 text-white rounded-tr-none" 
                            : msg.role === "admin"
                            ? "bg-rose-50 border border-rose-100 text-rose-950 rounded-tl-none"
                            : "bg-white text-gray-800 border border-gray-150 rounded-tl-none"
                        }`}>
                          <p className="whitespace-pre-wrap break-words font-medium">{msg.text}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Action presets / Quick replies panel */}
        <div className="px-4 py-2 border-t border-gray-150/60 bg-white shrink-0">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 select-none">
            One-Tap Floor Quick Replies
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto no-scrollbar">
            {quickReplies.map((reply, idx) => {
              const IconComp = reply.icon;
              let btnClass = "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100";
              if (reply.category === "pass") {
                btnClass = "bg-green-50 text-green-700 border-green-100 hover:bg-green-100/70";
              } else if (reply.category === "warning") {
                btnClass = "bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100/70";
              } else if (reply.category === "help") {
                btnClass = "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100/70";
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleQuickReply(reply.text)}
                  className={`py-1.5 px-3 rounded-full text-[11px] font-bold border flex items-center gap-1.5 transition active:scale-95 duration-100 cursor-pointer ${btnClass}`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{reply.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input message form controls */}
        <form onSubmit={handleSend} className="p-3 border-t border-gray-150 bg-white flex items-center gap-2 shrink-0">
          <input
            type="text"
            required
            disabled={isSending}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your bulletin dispatch message here..."
            className="flex-grow bg-slate-50 border border-gray-200 text-xs sm:text-sm p-3 rounded-xl outline-none text-slate-800 placeholder-gray-400 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition font-sans"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:opacity-50 text-white font-bold p-3 rounded-xl transition cursor-pointer flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>

    </div>
  );
}

export default React.memo(DiscussionBoard);
