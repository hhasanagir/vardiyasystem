-- v23: add the foreign keys schema.prisma declares but the initial v6
-- migration never created. `prisma migrate diff --from-migrations
-- --to-schema-datamodel` flagged both constraints as drift on a schema
-- built purely from the migration history; the deployed database and every
-- fresh `migrate deploy` produce tables with the columns but no FK, leaving
-- orphaned rows possible and a datamodel that over-promises integrity.
--
-- The constraints match what Prisma generates for the datamodel relations
-- (identity constraint names are required or the drift gate stays red):
--   WebPushSubscription.user      @relation(fields:[userId], references:[id], onDelete: Cascade)
--   NotificationPreference.user   @relation(fields:[userId], references:[id], onDelete: Cascade)

-- AddForeignKey: web_push_subscriptions.userId -> users.id
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: notification_preferences.userId -> users.id
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;