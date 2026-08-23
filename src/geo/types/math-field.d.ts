import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "math-field": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
          value?: string;
        };
      }
    }
  }
}
