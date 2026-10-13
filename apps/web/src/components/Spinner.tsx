function Spinner() {
  return (
    <div className="flex items-center gap-3 py-2" role="status">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
      <span>Lade …</span>
    </div>
  );
}

export default Spinner;
