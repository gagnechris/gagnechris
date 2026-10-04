import { NavLink } from 'react-router-dom';
import WorkspaceShell from '../workspace/WorkspaceShell';
import { navLinkClass } from '../workspace/ui/navLinkClass';

export default function AdminLayout() {
  return (
    <WorkspaceShell
      title="Admin"
      nav={
        <>
          <NavLink to="/" end className={navLinkClass}>
            Posts
          </NavLink>
          <NavLink to="/home" className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/resume" className={navLinkClass}>
            Resume
          </NavLink>
          <NavLink to="/projects" className={navLinkClass}>
            Projects
          </NavLink>
        </>
      }
    />
  );
}
