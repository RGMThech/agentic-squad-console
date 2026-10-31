import type { User } from "@/lib/session";
import { IconGithub, IconLayers, IconList, IconPlus, IconUsers } from "./Icons";
import type { NavItem } from "./Shell";

/** Navegação fora de uma squad. */
export function mainNav(user: User): NavItem[] {
  const nav: NavItem[] = [{ href: "/squads", label: "Squads", icon: <IconLayers size={17} />, exact: true }];
  if (user.isAdmin) {
    nav.push({ href: "/squads/new", label: "Nova squad", icon: <IconPlus size={17} /> });
    nav.push({ href: "/admin/conexoes", label: "Conexões", icon: <IconGithub size={17} /> });
    nav.push({ href: "/admin/usuarios", label: "Usuários", icon: <IconUsers size={17} /> });
    nav.push({ href: "/admin/auditoria", label: "Auditoria", icon: <IconList size={17} /> });
  }
  return nav;
}
