/**
 * テーマごとの動的効果 (WebGL 背景など) の読み込みと破棄。
 * 効果が必要なテーマは、ここで動的 import を登録する。該当テーマが選ばれたときだけコードが読み込まれる。
 */
type Effect = () => Promise<{ start: () => () => void }>;

const effects: Record<string, Effect> = {
  helix: () => import('./helix-bg'),
};

let dispose: (() => void) | null = null;

async function apply(theme: string) {
  if (dispose) { dispose(); dispose = null; }
  const load = effects[theme];
  if (!load) return;
  const mod = await load();
  // 読み込み中に別テーマへ切り替わっていたら何もしない
  if (document.documentElement.dataset.theme !== theme) return;
  dispose = mod.start();
}

apply(document.documentElement.dataset.theme ?? '');
window.addEventListener('themechange', (e) => apply((e as CustomEvent<string>).detail));
