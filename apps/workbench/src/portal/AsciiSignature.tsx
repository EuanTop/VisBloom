import { useEffect, useRef } from 'react';
import { mount } from 'ascii.rest';
import * as galaxy from 'ascii.rest/pieces/galaxy';

// The generic React entry imports a name-based gallery. This portal needs one piece.
export default function AsciiSignature({ playing }: { playing: boolean }) {
  const element = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (element.current) return mount(element.current, galaxy, { fps: playing ? 12 : 0 });
  }, [playing]);
  return <pre ref={element} aria-hidden="true" />;
}
