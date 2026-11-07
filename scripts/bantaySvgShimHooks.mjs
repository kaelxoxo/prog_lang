// Preloaded by `npm run mascot:sprites`: points react-native and react-native-svg at plain-SVG stand-ins
// so BantayMascotSvg renders with react-dom/server.
import { registerHooks } from 'node:module';

const shim = new URL('./bantaySvgShim.tsx', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react-native' || specifier === 'react-native-svg') return { url: shim, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
