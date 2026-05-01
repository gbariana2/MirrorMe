import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/compare(.*)",
  "/review(.*)",
  "/captain(.*)",
  "/dancer(.*)",
]);

const hasClerkKeys =
  typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0 &&
  typeof process.env.CLERK_SECRET_KEY === "string" &&
  process.env.CLERK_SECRET_KEY.length > 0;

const fallbackProxy = (request: NextRequest) => {
  if (isProtectedRoute(request)) {
    return NextResponse.json(
      { error: "Authentication is not configured. Missing Clerk environment variables." },
      { status: 503 },
    );
  }

  return NextResponse.next();
};

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export default hasClerkKeys ? clerkProxy : fallbackProxy;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
