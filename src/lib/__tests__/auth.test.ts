import { test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const mockSign = vi.fn().mockResolvedValue("mock-jwt-token");

vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation((payload) => {
    const builder = {
      _payload: payload,
      setProtectedHeader: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      sign: mockSign,
    };
    return builder;
  }),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const mockJwtVerify = vi.mocked(jwtVerify);

beforeEach(() => {
  vi.clearAllMocks();
});

test("getSession returns null when no cookie is set", async () => {
  mockCookieStore.get.mockReturnValue(undefined);

  const { getSession } = await import("@/lib/auth");
  const session = await getSession();

  expect(session).toBeNull();
  expect(mockCookieStore.get).toHaveBeenCalledWith("auth-token");
});

test("getSession returns null when cookie has no value", async () => {
  mockCookieStore.get.mockReturnValue({ name: "auth-token", value: undefined });

  const { getSession } = await import("@/lib/auth");
  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns session payload for a valid token", async () => {
  const mockPayload = {
    userId: "user-123",
    email: "test@example.com",
    expiresAt: new Date().toISOString(),
  };
  mockCookieStore.get.mockReturnValue({
    name: "auth-token",
    value: "valid-token",
  });
  mockJwtVerify.mockResolvedValue({
    payload: mockPayload,
    protectedHeader: { alg: "HS256" },
  } as any);

  const { getSession } = await import("@/lib/auth");
  const session = await getSession();

  expect(session).toEqual(mockPayload);
  expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
});

test("getSession returns null when token verification fails", async () => {
  mockCookieStore.get.mockReturnValue({
    name: "auth-token",
    value: "invalid-token",
  });
  mockJwtVerify.mockRejectedValue(new Error("JWT expired"));

  const { getSession } = await import("@/lib/auth");
  const session = await getSession();

  expect(session).toBeNull();
});

test("deleteSession deletes the auth cookie", async () => {
  const { deleteSession } = await import("@/lib/auth");
  await deleteSession();

  expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
});

function createMockRequest(cookieValue?: string) {
  const cookies = {
    get: vi.fn((name: string) =>
      name === "auth-token" && cookieValue !== undefined
        ? { name: "auth-token", value: cookieValue }
        : undefined
    ),
  };
  return { cookies } as unknown as import("next/server").NextRequest;
}

test("verifySession returns null when no cookie is present", async () => {
  const { verifySession } = await import("@/lib/auth");
  const request = createMockRequest();

  const session = await verifySession(request);

  expect(session).toBeNull();
  expect(request.cookies.get).toHaveBeenCalledWith("auth-token");
});

test("verifySession returns session payload for a valid token", async () => {
  const mockPayload = {
    userId: "user-456",
    email: "verify@example.com",
    expiresAt: new Date().toISOString(),
  };
  mockJwtVerify.mockResolvedValue({
    payload: mockPayload,
    protectedHeader: { alg: "HS256" },
  } as any);

  const { verifySession } = await import("@/lib/auth");
  const request = createMockRequest("valid-token");

  const session = await verifySession(request);

  expect(session).toEqual(mockPayload);
  expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", expect.anything());
});

test("verifySession returns null when token verification fails", async () => {
  mockJwtVerify.mockRejectedValue(new Error("JWT expired"));

  const { verifySession } = await import("@/lib/auth");
  const request = createMockRequest("invalid-token");

  const session = await verifySession(request);

  expect(session).toBeNull();
});
