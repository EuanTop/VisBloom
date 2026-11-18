export default function PortalChapterNav({ current, goTo, chapters }: { current: number; goTo: (index: number) => void; chapters: readonly {id:string;label:string}[] }) {
  return <nav className="portal-chapters" aria-label="首页章节">
    {chapters.map((page,index) => <button key={page.id} type="button"
      aria-label={`第 ${index + 1} 页：${page.label}`} aria-current={index === current ? 'step' : undefined}
      onClick={() => goTo(index)}><span>{page.label}</span><i/></button>)}
    <p aria-hidden="true">{String(current + 1).padStart(2,'0')} / {String(chapters.length).padStart(2,'0')}</p>
  </nav>;
}
