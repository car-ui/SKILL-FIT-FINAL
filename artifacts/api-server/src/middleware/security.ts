import type { Request, Response, NextFunction } from "express";
import type { CipherGCM, DecipherGCM } from "crypto";
import crypto from "crypto";

// Security headers middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.groq.com https://generativelanguage.googleapis.com https://*.supabase.co; frame-ancestors 'none';"
  );

  // HSTS (HTTP Strict Transport Security) - only in production
  if (process.env["NODE_ENV"] === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

// Request logging with sensitive data filtering
export function secureLogging(req: Request, res: Response, next: NextFunction): void {
  // Remove sensitive data from logs
  const safeBody = { ...req.body };
  if (safeBody.password) safeBody.password = "[REDACTED]";
  if (safeBody.apiKey) safeBody.apiKey = "[REDACTED]";
  if (safeBody.token) safeBody.token = "[REDACTED]";

  req.log = req.log || console;
  req.log.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    body: safeBody,
  });

  next();
}

// Input validation and sanitization
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Basic XSS prevention - escape HTML characters in string inputs
  function sanitizeString(str: string): string {
    return str.replace(/[<>]/g, "");
  }

  function sanitizeObject(obj: any): any {
    if (typeof obj === "string") {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === "object") {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  }

  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  next();
}

// Generate secure tokens
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

// Validate phone number format
export function validatePhoneNumber(phone: string): boolean {
  // Allow international format or Indian format
  const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ""));
}

// Device fingerprinting for duplicate detection
export function generateDeviceFingerprint(req: Request): string {
  const components = [
    req.get("User-Agent") || "",
    req.ip || "",
    req.get("Accept-Language") || "",
    req.get("Accept-Encoding") || "",
  ];

  return crypto.createHash("sha256").update(components.join("|")).digest("hex");
}

// Data encryption utilities
export class EncryptionService {
  private algorithm = "aes-256-gcm";
  private key: Buffer;

  constructor() {
    const keyString = process.env["ENCRYPTION_KEY"];
    if (!keyString) {
      throw new Error("ENCRYPTION_KEY environment variable is required");
    }
    this.key = crypto.scryptSync(keyString, "salt", 32);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as CipherGCM;
    cipher.setAAD(Buffer.from("additional-data"));

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();
    return iv.toString("hex") + ":" + encrypted + ":" + authTag.toString("hex");
  }

  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const authTag = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv) as DecipherGCM;
    decipher.setAAD(Buffer.from("additional-data"));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}