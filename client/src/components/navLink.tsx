import { Link, useLocation } from "wouter";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ href, children, className, activeClassName, ...props }, ref) => {
    const [location] = useLocation();

    const isActive = location === href;

    return (
      <Link href={href}>
        <a
          ref={ref}
          className={cn(className, isActive && activeClassName)}
          {...props}
        >
          {children}
        </a>
      </Link>
    );
  }
);

NavLink.displayName = "NavLink";

export { NavLink };