select "Farm"."userId", "Farm"."plantId", "Farm"."wateredAt", "Farm"."fertilisedAt", "Farm".id
  from "Farm"
  inner join "Premium" on "Premium"."userId" = "Farm"."userId" and "Premium".level = 4
  left join "DMSettings" on "DMSettings"."userId" = "Farm"."userId"
  where "Farm"."wateredAt" < now() - interval '1 day' and "Farm"."fertilisedAt" < now() - interval '5 day' and "DMSettings"."farmHealth" = true