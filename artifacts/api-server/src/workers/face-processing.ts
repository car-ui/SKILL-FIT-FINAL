import { faceProcessingQueue } from "../lib/queues";
import { db } from "../lib/db";
import { integrityChecksTable, candidatesTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";

// Process face processing and duplicate detection jobs
faceProcessingQueue.process(async (job) => {
  const { interviewId, candidateId, deviceFingerprint } = job.data as {
    interviewId: number;
    candidateId: number;
    videoUrl?: string;
    deviceFingerprint?: string | null;
  };

  // Implement duplicate detection based on phone number and device fingerprint.
  // Face embedding comparison can be added later as an advanced enhancement.

  const [candidate] = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId));

  if (!candidate) {
    throw new Error("Candidate not found");
  }

  // Check for duplicate based on phone number across different candidate records
  let duplicateCandidateId: number | null = null;
  if (candidate.phone) {
    const phoneDuplicates = await db
      .select({ id: candidatesTable.id })
      .from(candidatesTable)
      .where(and(
        eq(candidatesTable.phone, candidate.phone),
        ne(candidatesTable.id, candidateId)
      ));

    if (phoneDuplicates.length > 0) {
      duplicateCandidateId = phoneDuplicates[0].id;
    }
  }

  // Check for duplicate based on device fingerprint
  if (!duplicateCandidateId && deviceFingerprint) {
    const deviceDuplicates = await db
      .select({ id: candidatesTable.id })
      .from(candidatesTable)
      .where(and(
        eq(candidatesTable.deviceFingerprint, deviceFingerprint),
        ne(candidatesTable.id, candidateId)
      ));

    if (deviceDuplicates.length > 0) {
      duplicateCandidateId = deviceDuplicates[0].id;
    }
  }

  const duplicateFlags = duplicateCandidateId ? ["suspected_duplicate"] : [];

  const [existingIntegrity] = await db
    .select()
    .from(integrityChecksTable)
    .where(eq(integrityChecksTable.interviewId, interviewId));

  if (existingIntegrity) {
    await db
      .update(integrityChecksTable)
      .set({
        duplicateCandidateId,
        flags: [...new Set([...(existingIntegrity.flags || []), ...duplicateFlags])],
      })
      .where(eq(integrityChecksTable.interviewId, interviewId));
  } else {
    await db.insert(integrityChecksTable).values({
      interviewId,
      duplicateCandidateId,
      flags: duplicateFlags,
    });
  }

  return {
    hasDuplicates: duplicateCandidateId !== null,
    duplicateCandidateId,
  };
});
