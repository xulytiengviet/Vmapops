'use client';

import { UserProfilePanel } from './UserProfilePanel';

export function Navbar() {
  return (
    <div className="absolute top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-end px-6 py-3">
        {/* Right side - Profile */}
        <div className="flex items-center gap-3">
          <UserProfilePanel />
        </div>
      </div>
    </div>
  );
}

