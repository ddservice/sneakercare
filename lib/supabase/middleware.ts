import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;
  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".");

  if (isStatic) {
    return supabaseResponse;
  }

  let user = null;
  let authFailed = false;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      authFailed = true;
    } else {
      user = data.user;
    }
  } catch {
    authFailed = true;
  }

  // If auth failed, clear all Supabase auth cookies from response
  if (authFailed) {
    const allCookies = request.cookies.getAll();
    allCookies.forEach((c) => {
      if (c.name.includes("sb-") || c.name.includes("auth-token")) {
        supabaseResponse.cookies.delete(c.name);
      }
    });

    if (pathname !== "/login") {
      const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
      allCookies.forEach((c) => {
        if (c.name.includes("sb-") || c.name.includes("auth-token")) {
          redirectResponse.cookies.delete(c.name);
        }
      });
      return redirectResponse;
    }
  } else if (user && pathname === "/login") {
    // If already logged in and visiting /login, redirect to /dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}
