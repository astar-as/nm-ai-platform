export function Background() {
  return (
    <div className="fixed inset-0 -z-10 print-hidden">
      <div className="absolute inset-0 bg-background" />

      <div className="absolute inset-0 opacity-100 dark:opacity-30">
        <div
          className="absolute top-0 left-0 w-[800px] h-[800px] rounded-full opacity-25 blur-[120px]"
          style={{ background: '#0a5064' }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full opacity-30 blur-[100px]"
          style={{ background: '#96145a' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-20 blur-[110px]"
          style={{ background: '#c0a0b0' }}
        />
        <div
          className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
          style={{ background: '#507090' }}
        />
      </div>

      <div className="absolute inset-0 grain-overlay opacity-[0.03]" />
    </div>
  );
}
