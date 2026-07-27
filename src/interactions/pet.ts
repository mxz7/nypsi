import { AutocompleteHandler } from "../types/InteractionHandler";
import { getUserPets } from "../utils/functions/economy/pets";
import { getItems, getPetsData } from "../utils/functions/economy/utils";

export default {
  name: "pet",
  type: "autocomplete",
  async run(interaction) {
    const search = interaction.options.getFocused().toLowerCase();
    const pets = await getUserPets(interaction.user.id);

    return interaction.respond(
      pets
        .map((pet) => getItems()[getPetsData()[pet.petId].item])
        .filter(
          (item) =>
            item.id.includes(search) ||
            item.name.includes(search) ||
            item.aliases?.some((alias) => alias.includes(search)),
        )
        .map((item) => ({
          name: `${item.emoji} ${item.name}`,
          value: item.id,
        })),
    );
  },
} as AutocompleteHandler;
