import type { PropsWithChildren } from "react";
import Nav from "./Nav";
import TopBar from "./TopBar";

type LayoutProps = PropsWithChildren<{
  onLogout: () => void;
}>;

const Layout = ({ children, onLogout }: LayoutProps) => {
  return (
    <div className="app">
      <TopBar onLogout={onLogout} />
      <div className="container">{children}</div>
      <Nav />
    </div>
  );
};

export default Layout;
