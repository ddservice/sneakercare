/** ไฟล์นี้ถูก exclude จาก tsconfig หลัก — ใช้พิสูจน์ TS2344 เท่านั้น */
import type React from "react";

type LayoutRoutes = "/";
interface ParamMap {
  "/": Record<string, never>;
}
interface LayoutSlotMap {
  "/": never;
}
type LayoutProps<LayoutRoute extends LayoutRoutes> = {
  params: Promise<ParamMap[LayoutRoute]>;
  children: React.ReactNode;
} & {
  [K in LayoutSlotMap[LayoutRoute]]: React.ReactNode;
};
type LayoutConfig<Route extends LayoutRoutes = LayoutRoutes> = {
  default:
    | React.ComponentType<LayoutProps<Route>>
    | ((
        props: LayoutProps<Route>
      ) => React.ReactNode | Promise<React.ReactNode> | never | void | Promise<void>);
};
export type Proof = LayoutConfig;
