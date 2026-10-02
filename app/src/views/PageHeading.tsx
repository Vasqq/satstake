import { type ReactNode, createContext, useContext, useEffect, useRef } from "react";

/**
 * False until the visitor has changed the route once. Focus is moved only after that, so opening the site
 * does not skip past the navigation; the default is true so a heading used alone behaves as after a change.
 *
 * @trace LLR-FE-072
 */
export const NavigatedContext = createContext(true);

/**
 * The one h1 of a page. Mounting it sets the document title, and after the first route change it also moves
 * focus to it, so a route change is announced to a screen reader and the next Tab starts from the new page.
 *
 * @trace LLR-FE-072
 */
export function PageHeading({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const navigated = useContext(NavigatedContext);
  useEffect(() => {
    document.title = title;
    if (navigated) ref.current?.focus();
  }, [title, navigated]);
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  );
}
