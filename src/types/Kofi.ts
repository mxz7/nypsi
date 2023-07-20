export interface KofiResponse {
  type: string;
  email: string;
  tier_name?: string;
  shop_items?: { direct_link_code: string; quantity: number }[];
  verification_token: string;
  is_public: boolean;
  amount: string;
}
