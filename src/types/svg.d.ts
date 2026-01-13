// SVG modules are handled by vite/client.d.ts
// This file only declares CSS modules

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
