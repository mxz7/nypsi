-- AddForeignKey
ALTER TABLE "Captcha" ADD CONSTRAINT "Captcha_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
