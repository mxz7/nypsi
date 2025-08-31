-- AddForeignKey
ALTER TABLE "public"."tmdbRatings" ADD CONSTRAINT "tmdbRatings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
