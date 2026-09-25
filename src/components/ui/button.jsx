import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// TOGETTHERE canonical button system. Every variant has a clearly visible
// FILLED background (no ghost/transparent actions that blend into the page),
// built from the existing palette tokens (terra, ink, cream, destructive).
//  - default  (primary):    terra filled, cream text
//  - secondary (neutral):   muted ink/stone filled surface, readable text
//  - destructive:           SOLID RED, white icon/label — mandatory for Delete/Remove
//  - outline:               neutral filled surface + border (secondary actions)
//  - ghost:                 subtle filled surface (low-emphasis rows)
// All variants share hover, active-press, focus-visible and disabled states,
// and read as buttons in BOTH light and dark mode via theme tokens.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-terra text-cream shadow-sm hover:bg-terra-deep",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-foreground/15 bg-foreground/10 text-foreground hover:bg-foreground/15",
        secondary:
          "bg-foreground/10 text-foreground hover:bg-foreground/15",
        ghost: "bg-foreground/5 text-foreground hover:bg-foreground/10",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }