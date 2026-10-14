function LiveIndicator() {
  return (
    <div className="flex items-center gap-2" role="status">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
      </span>
      <span className="text-sm font-semibold text-slate-800">Standort wird geteilt</span>
    </div>
  );
}

export default LiveIndicator;
