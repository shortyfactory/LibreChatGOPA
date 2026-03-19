import { useOutletContext } from 'react-router-dom';
import type { ContextType } from '~/common';
import { OpenSidebar } from '~/components/Chat/Menus';

export default function SidebarReopenButton() {
  const { navVisible, setNavVisible } = useOutletContext<ContextType>();

  if (navVisible) {
    return null;
  }

  return (
    <div className="sticky top-0 z-20 mb-4 hidden md:flex">
      <div className="via-presentation/95 w-fit rounded-2xl bg-gradient-to-b from-presentation to-transparent pb-2">
        <OpenSidebar setNavVisible={setNavVisible} />
      </div>
    </div>
  );
}
