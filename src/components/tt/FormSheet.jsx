import React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';

export default function FormSheet({ open, onOpenChange, title, children, maxWidth = 'max-w-lg' }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="tt-card bg-card text-card-foreground rounded-t-[1.5rem] max-h-[92vh]">
          <DrawerHeader className="px-6 pt-4 pb-2 text-left">
            <DrawerTitle className="font-display text-2xl font-bold text-ink-deep">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-6 tt-drawer-pb overflow-y-auto">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`tt-card bg-card text-card-foreground rounded-[1.5rem] p-0 ${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="font-display text-2xl font-bold text-ink-deep">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}