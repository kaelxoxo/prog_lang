// Stands in for `react-native` and `react-native-svg` when scripts/generateBantaySprites.tsx renders
// BantayMascotSvg with react-dom/server: each SVG component becomes the plain SVG element.
import { createElement, type ReactNode } from 'react';

type Props = Record<string, unknown> & { children?: ReactNode };

const element = (tag: string) => (props: Props) => createElement(tag, props);

export default function Svg(props: Props) {
  return createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', ...props });
}

export const G = element('g');
export const Path = element('path');
export const Ellipse = element('ellipse');
export const Circle = element('circle');
export const Rect = element('rect');

// react-native: the wrapping View only carries layout and accessibility, which a still image doesn't need.
export function View({ children }: Props) {
  return <>{children}</>;
}
