import { useEffect, useRef, useState } from 'react';
import type { Project, Value, RuntimeState } from '@art/contracts';
import { api, ApiError, errorMessage, json } from '../api';
import controls from '../../../../cases/stellar-drift/controls.json';
const exhibitionParameters=Object.fromEntries(controls.map(control=>[control.id,control.default]));

export function useStudy(enabled = true) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const opening = useRef(false);
  const pending = useRef<{ project: Project; preset: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api('/api/projects', { signal: controller.signal }).then(() => setOnline(true)).catch(() => { if (!controller.signal.aborted) setOnline(false); });
    return () => controller.abort();
  }, [enabled]);
  async function open(preset: 'stellar-drift' | 'skinbloom-ingredients' | 'martover' | 'physarum', years = 320000, yaw = -36, pitch = 22, selectedParameters?: Record<string, Value>, selectedRuntime?:RuntimeState) {
    if (!enabled || opening.current) return;
    opening.current = true; setBusy(preset); setError('');
    try {
      const create = () => api<Project>('/api/projects', json('POST', {
        name: preset==='physarum'?'生长之间 · 我的作品':preset==='martover'?'Martover · 我的目标地':preset === 'stellar-drift' ? '恒星漂移 · 门户习作' : 'SkinBloom Ingredients · 我的习作', preset,
      }));
      let context: { project: Project } | undefined;
      let project: Project;
      if (pending.current?.preset === preset) {
        project = pending.current.project;
        try { context = await api<{ project: Project }>(`/api/projects/${encodeURIComponent(project.id)}/context`); }
        catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          pending.current = null; project = await create();
        }
      } else project = await create();
      pending.current = { project, preset };
      if (preset === 'stellar-drift' || selectedParameters || selectedRuntime) {
        context ??= await api<{ project: Project }>(`/api/projects/${encodeURIComponent(project.id)}/context`);
        project = await api<Project>(`/api/projects/${encodeURIComponent(project.id)}/state`, json('PATCH', {
          expectedRevision: context.project.revision,
          patch: { paused: true,...(selectedRuntime?{runtime:selectedRuntime}:{}), parameters: { ...context.project.state.parameters,
            ...(preset === 'stellar-drift' ? { ...exhibitionParameters, spanYears: years, viewYaw: yaw, viewPitch: pitch } : {}), ...selectedParameters } },
        }));
      }
      location.assign(`/?project=${encodeURIComponent(project.id)}`);
    } catch (reason) {
      setError(`${pending.current ? '作品副本已保留，可以重试。' : '作品暂时无法创建。'}${errorMessage(reason)}。请确认本机工作台服务正在运行。`);
      setBusy(''); opening.current = false;
    }
  }
  return { open, busy, error, online, clearError: () => setError('') };
}
