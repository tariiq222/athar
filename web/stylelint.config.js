export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    // Allow 1px, 2px, 44px, breakpoint values; ban raw pixel values otherwise.
    // Side-stripe borders banned (per .impeccable.md AI-slop test).
    // Combined into one rule call: the object's keys are matched against the
    // declaration property name (string or regex), values are arrays of
    // disallowed-value regexes.
    'declaration-property-value-disallowed-list': {
      '/.*/': [
        /(?<!\d)(?<!\b1)(?<!\b2)(?<!\b44)(?<!\b768)(?<!\b1024)(?<!\b1280)(?<!\b1440)\d+px(?!.*media)/,
      ],
      'border-left-width': [/^(?:[3-9]|[1-9]\d|\d{3,})px$/],
      'border-right-width': [/^(?:[3-9]|[1-9]\d|\d{3,})px$/],
    },
    // Tokens.css + globals.css are the design-system source; they intentionally
    // use single-line declarations, quote-wrapped font names, unannotated hues,
    // and `@import './x.css'` (not url()) syntax.
    'import-notation': null,
    'declaration-block-single-line-max-declarations': null,
    'font-family-name-quotes': null,
    'hue-degree-notation': null,
    'custom-property-empty-line-before': null,
    'comment-empty-line-before': null,
  },
  overrides: [
    {
      files: ['styles/tokens.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
        'color-no-hex': null,
      },
    },
    {
      files: ['styles/globals.css'],
      rules: {
        'declaration-property-value-disallowed-list': null,
        'color-no-hex': null,
      },
    },
  ],
}