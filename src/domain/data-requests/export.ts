import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import type { Context } from "../context";
import {
  accounts,
  artisanRegions,
  authUsers,
  dataRequests,
  engagements,
  jobs,
  messages,
  namesSent,
  notices,
  payments,
  payouts,
  profileEdits,
  quotes,
  refunds,
  regions,
  reports,
  reviews,
  sightings,
  supportRequests,
  verificationChecks,
} from "../schema";
import { suspensionsOf, warningsOf } from "../standing";

// A copy of an Account's data (#141): what it gave and did, and what the
// platform recorded about it, as JSON. Never another Account's personal data,
// a Report of it, or the Admin's own records (queue items, Signals, the audit
// log), and never a secret such as its password.

/** The Account's data, newest version of each thing, as the export's JSON. */
export async function exportOf(ctx: Context, accountId: string) {
  const [account] = await ctx.db
    .select({
      kind: accounts.kind,
      name: accounts.name,
      tradingName: accounts.tradingName,
      email: authUsers.email,
      signedUpAt: accounts.signedUpAt,
      rulesVersion: accounts.rulesVersion,
      rulesAcceptedAt: accounts.rulesAcceptedAt,
      vatNumber: accounts.vatNumber,
      availableForJobs: accounts.availableForJobs,
      closedAt: accounts.closedAt,
    })
    .from(accounts)
    .innerJoin(authUsers, eq(authUsers.id, accounts.id))
    .where(eq(accounts.id, accountId));
  if (!account) return null;
  const artisan = account.kind === "artisan";

  const [
    names,
    seen,
    told,
    support,
    made,
    warned,
    suspended,
    asked,
    theirEngagements,
    sent,
    written,
    received,
  ] = await Promise.all([
    ctx.db
      .select({
        name: namesSent.name,
        tradingName: namesSent.tradingName,
        state: namesSent.state,
        sentAt: namesSent.sentAt,
      })
      .from(namesSent)
      .where(eq(namesSent.accountId, accountId))
      .orderBy(asc(namesSent.sentAt)),
    ctx.db
      .select({
        device: sightings.device,
        ip: sightings.ip,
        at: sightings.at,
        seenAt: sightings.seenAt,
      })
      .from(sightings)
      .where(eq(sightings.accountId, accountId))
      .orderBy(asc(sightings.seenAt)),
    ctx.db
      .select({
        event: notices.event,
        title: notices.title,
        link: notices.link,
        toldAt: notices.toldAt,
      })
      .from(notices)
      .where(eq(notices.accountId, accountId))
      .orderBy(asc(notices.toldAt)),
    ctx.db
      .select({
        topic: supportRequests.topic,
        message: supportRequests.message,
        sentAt: supportRequests.sentAt,
      })
      .from(supportRequests)
      .where(and(eq(supportRequests.accountId, accountId), isNotNull(supportRequests.topic)))
      .orderBy(asc(supportRequests.sentAt)),
    ctx.db
      .select({
        subject: reports.subjectKind,
        subjectId: reports.subjectId,
        reason: reports.reason,
        note: reports.note,
        reportedAt: reports.reportedAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, accountId))
      .orderBy(asc(reports.reportedAt)),
    warningsOf(ctx, accountId),
    suspensionsOf(ctx, accountId),
    ctx.db
      .select({ kind: dataRequests.kind, requestedAt: dataRequests.requestedAt })
      .from(dataRequests)
      .where(eq(dataRequests.accountId, accountId))
      .orderBy(asc(dataRequests.requestedAt)),
    ctx.db
      .select({
        engagementId: engagements.id,
        jobId: engagements.jobId,
        quoteId: engagements.quoteId,
        state: engagements.state,
        artisanFeePercent: engagements.artisanFeePercent,
        hiredAt: engagements.hiredAt,
        workStartedAt: engagements.workStartedAt,
        completedAt: engagements.completedAt,
        cancelledAt: engagements.cancelledAt,
        cancelledBy: engagements.cancelledBy,
      })
      .from(engagements)
      .where(or(eq(engagements.clientId, accountId), eq(engagements.artisanId, accountId)))
      .orderBy(asc(engagements.hiredAt)),
    ctx.db
      .select({
        conversationId: messages.conversationId,
        text: messages.text,
        photos: messages.photos,
        files: messages.files,
        state: messages.state,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .where(eq(messages.senderId, accountId))
      .orderBy(asc(messages.sentAt)),
    ctx.db
      .select({
        engagementId: reviews.engagementId,
        rating: reviews.rating,
        comment: reviews.comment,
        writtenAt: reviews.writtenAt,
      })
      .from(reviews)
      .where(eq(reviews.authorId, accountId))
      .orderBy(asc(reviews.writtenAt)),
    ctx.db
      .select({
        engagementId: reviews.engagementId,
        rating: reviews.rating,
        comment: reviews.comment,
        writtenAt: reviews.writtenAt,
      })
      .from(reviews)
      .where(eq(reviews.reviewedId, accountId))
      .orderBy(asc(reviews.writtenAt)),
  ]);

  const asClient = artisan
    ? {}
    : {
        jobs: (
          await ctx.db
            .select()
            .from(jobs)
            .where(eq(jobs.clientId, accountId))
            .orderBy(asc(jobs.createdAt))
        ).map(withoutAdminNote),
        payments: await ctx.db
          .select()
          .from(payments)
          .where(eq(payments.clientId, accountId))
          .orderBy(asc(payments.openedAt)),
        refunds: await ctx.db
          .select()
          .from(refunds)
          .where(eq(refunds.clientId, accountId))
          .orderBy(asc(refunds.madeAt)),
      };
  const asArtisan = artisan
    ? {
        verification: await ctx.db
          .select({
            kind: verificationChecks.kind,
            category: verificationChecks.category,
            state: verificationChecks.state,
            details: verificationChecks.details,
            expiresOn: verificationChecks.expiresOn,
            issuedOn: verificationChecks.issuedOn,
            submittedAt: verificationChecks.submittedAt,
            decidedAt: verificationChecks.decidedAt,
            reason: verificationChecks.reason,
            removedAt: verificationChecks.removedAt,
            removedReason: verificationChecks.removedReason,
          })
          .from(verificationChecks)
          .where(eq(verificationChecks.artisanId, accountId))
          .orderBy(asc(verificationChecks.submittedAt)),
        regions: await ctx.db
          .select({ name: regions.name })
          .from(artisanRegions)
          .innerJoin(regions, eq(regions.id, artisanRegions.regionId))
          .where(eq(artisanRegions.artisanId, accountId)),
        profile: await ctx.db
          .select({
            about: profileEdits.about,
            photos: profileEdits.photos,
            state: profileEdits.state,
            sentAt: profileEdits.sentAt,
          })
          .from(profileEdits)
          .where(eq(profileEdits.artisanId, accountId))
          .orderBy(asc(profileEdits.sentAt)),
        quotes: (
          await ctx.db
            .select()
            .from(quotes)
            .where(eq(quotes.artisanId, accountId))
            .orderBy(asc(quotes.createdAt))
        ).map(withoutAdminNote),
        payouts: await ctx.db
          .select()
          .from(payouts)
          .where(eq(payouts.artisanId, accountId))
          .orderBy(asc(payouts.createdAt)),
      }
    : {};

  return {
    exportedAt: ctx.now(),
    account,
    names,
    ...asClient,
    ...asArtisan,
    engagements: theirEngagements,
    messagesSent: sent,
    reviewsWritten: written,
    reviewsReceived: received,
    reportsMade: made,
    warnings: warned,
    suspensions: suspended,
    supportRequests: support,
    dataRequests: asked,
    notices: told,
    sightings: seen,
  };
}

/** A Job or Quote less why the Content check Held it, which is for the Admin. */
function withoutAdminNote<Row extends { heldFor: string | null }>(row: Row): Omit<Row, "heldFor"> {
  const { heldFor, ...own } = row;
  void heldFor;
  return own;
}
