import noArbitraryPx from './no-arbitrary-px.js';
import noDeepUiImport from './no-deep-ui-import.js';
import noHandAddDoor from './no-hand-add-door.js';
import noHandBackLink from './no-hand-back-link.js';
import noHexColor from './no-hex-color.js';
import noLocalPrimitive from './no-local-primitive.js';
import noNonTokenClass from './no-non-token-class.js';
import noRadiusShadow from './no-radius-shadow.js';
import noRawControl from './no-raw-control.js';
import noStyleDesign from './no-style-design.js';

export const rules = {
  'no-arbitrary-px': noArbitraryPx,
  'no-deep-ui-import': noDeepUiImport,
  'no-hand-add-door': noHandAddDoor,
  'no-hand-back-link': noHandBackLink,
  'no-hex-color': noHexColor,
  'no-local-primitive': noLocalPrimitive,
  'no-non-token-class': noNonTokenClass,
  'no-radius-shadow': noRadiusShadow,
  'no-raw-control': noRawControl,
  'no-style-design': noStyleDesign,
};

export default { rules };
