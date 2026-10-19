import { jsxName, leadingText, staticAttr } from './jsx-door-text.js';

const NAVIGATING = new Set(['Link', 'NavLink', 'a']);
const CLICKABLE = new Set([...NAVIGATING, 'button', 'Button']);

/**
 * The way back has one form: `BackLink` from 'ui' draws `← word` as an underlined word. A link or
 * button whose text starts with a hand-typed `←` is a second form of the same door. A bare `←` is
 * a back door when it navigates or names `back` in its label; a bare `←` that pages through
 * frames («previous page») is a stepper, not a way back, and stays.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: "Draw the way back with BackLink from 'ui', not a hand-typed ←." },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const name = jsxName(node);
        if (!CLICKABLE.has(name)) return;
        const text = leadingText(node, CLICKABLE);
        if (!text.startsWith('←')) return;
        const rest = text.slice(1).trim();
        if (!rest) {
          const label = `${staticAttr(node, 'aria-label') ?? ''} ${staticAttr(node, 'title') ?? ''}`;
          if (!NAVIGATING.has(name) && !/\bback\b/iu.test(label)) return;
        }
        context.report({
          node: node.openingElement,
          message:
            "Use BackLink from 'ui' for the way back (`<BackLink to={…}>word</BackLink>`), not a hand-typed ←.",
        });
      },
    };
  },
};
