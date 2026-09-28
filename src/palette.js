// 固定 8 色實色調色盤。淺色模式用深色底配白字,深色模式用亮色底配深字。
export const COLORS = [
  { name: '紅', light: { bg: '#C0392B', fg: '#FFFFFF' }, dark: { bg: '#F28B82', fg: '#1A1A1A' } },
  { name: '橘', light: { bg: '#B45309', fg: '#FFFFFF' }, dark: { bg: '#F5B26B', fg: '#1A1A1A' } },
  { name: '綠', light: { bg: '#4D7C0F', fg: '#FFFFFF' }, dark: { bg: '#A3D66B', fg: '#1A1A1A' } },
  { name: '青', light: { bg: '#0F766E', fg: '#FFFFFF' }, dark: { bg: '#5EC8BE', fg: '#1A1A1A' } },
  { name: '藍', light: { bg: '#1D4ED8', fg: '#FFFFFF' }, dark: { bg: '#8AB4FF', fg: '#1A1A1A' } },
  { name: '紫', light: { bg: '#6D28D9', fg: '#FFFFFF' }, dark: { bg: '#C4A7F5', fg: '#1A1A1A' } },
  { name: '粉', light: { bg: '#BE185D', fg: '#FFFFFF' }, dark: { bg: '#F49AC1', fg: '#1A1A1A' } },
  { name: '灰', light: { bg: '#475569', fg: '#FFFFFF' }, dark: { bg: '#B4BFCE', fg: '#1A1A1A' } },
];

export const clampColor = (n) => (Number.isInteger(n) && n >= 0 && n < COLORS.length ? n : 0);
