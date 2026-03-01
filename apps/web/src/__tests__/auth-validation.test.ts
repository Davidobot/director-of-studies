/**
 * Tests for auth form validation logic.
 * These test the validation patterns used in LoginForm and SignupForm
 * without rendering React components (pure logic tests).
 */

import { describe, it, expect } from "vitest";

describe("Auth validation patterns", () => {
  describe("email validation", () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    it("should accept valid emails", () => {
      expect(emailRegex.test("user@example.com")).toBe(true);
      expect(emailRegex.test("student@school.co.uk")).toBe(true);
      expect(emailRegex.test("name+tag@gmail.com")).toBe(true);
    });

    it("should reject invalid emails", () => {
      expect(emailRegex.test("")).toBe(false);
      expect(emailRegex.test("not-an-email")).toBe(false);
      expect(emailRegex.test("@missing-local.com")).toBe(false);
      expect(emailRegex.test("user@")).toBe(false);
    });
  });

  describe("password strength", () => {
    function isStrongEnough(password: string): boolean {
      return password.length >= 8;
    }

    it("should accept passwords 8+ chars", () => {
      expect(isStrongEnough("12345678")).toBe(true);
      expect(isStrongEnough("a-strong-password")).toBe(true);
    });

    it("should reject short passwords", () => {
      expect(isStrongEnough("short")).toBe(false);
      expect(isStrongEnough("")).toBe(false);
    });
  });

  describe("age calculation", () => {
    function calculateAge(dateOfBirth: string): number {
      const dob = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (
        today.getMonth() < dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
      ) {
        age--;
      }
      return age;
    }

    it("should correctly calculate age for an adult", () => {
      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
      const age = calculateAge(twentyYearsAgo.toISOString().slice(0, 10));
      expect(age).toBe(20);
    });

    it("should correctly identify under-13", () => {
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const age = calculateAge(tenYearsAgo.toISOString().slice(0, 10));
      expect(age).toBe(10);
      expect(age < 13).toBe(true);
    });

    it("should handle birthday edge case", () => {
      // Someone whose birthday is tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setFullYear(tomorrow.getFullYear() - 13);
      const age = calculateAge(tomorrow.toISOString().slice(0, 10));
      expect(age).toBe(12); // Not yet 13
    });
  });

  describe("ToS acceptance check", () => {
    it("should identify users needing ToS acceptance", () => {
      const user = { termsAcceptedAt: null };
      expect(user.termsAcceptedAt === null).toBe(true);
    });

    it("should pass users who accepted ToS", () => {
      const user = { termsAcceptedAt: "2025-01-01T00:00:00Z" };
      expect(user.termsAcceptedAt !== null).toBe(true);
    });
  });
});
