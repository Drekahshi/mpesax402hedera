import { Bell, Menu } from "lucide-react";

export default function TopHeader() {
  return (
    <header className="sticky top-0 z-40 bg-[#121212]/80 backdrop-blur-md w-full px-4 py-4 flex items-center justify-between border-b border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-gold to-orange flex items-center justify-center">
          <span className="text-black font-black text-sm">K</span>
        </div>
        <h1 className="font-bold text-lg tracking-wide text-white">Kai Bay</h1>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative text-white/70 hover:text-white transition-colors">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red rounded-full border border-[#121212]"></span>
        </button>
        <button className="text-white/70 hover:text-white transition-colors">
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
}
