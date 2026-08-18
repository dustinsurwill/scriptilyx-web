/** Curated list of common Space Engineers inventory items for the ItemId/
 * ItemType property picker (conveyor sorter filters, inventory checks).
 *
 * `id` is the `TypeId/SubtypeId` string the game's own MyInventoryItem/
 * MyDefinitionId types use internally (see GetItemAmount in
 * src/lib/codegen/helpers.ts and IfConveyorSorterAllowsItem's
 * MyDefinitionId.Parse in src/lib/codegen/emitters.ts) — never shown to a
 * player in-game. `name` is what a player actually sees in their
 * inventory/HUD ("Iron Ore"), which is what this list exists to search by.
 *
 * Hand-compiled from public, version-stable Space Engineers item
 * definitions (ores/ingots/base components/bottles/consumables — the set
 * least likely to be renamed by a game update); NOT sourced from the
 * Scriptilyx SE desktop app or any of its material. Deliberately not
 * exhaustive — weapon/ammo/tool subtype ids vary more across game
 * versions and DLC, so they're left out rather than risk a wrong id. The
 * ItemId/ItemType fields stay free text specifically so anything missing
 * here (including modded items, which reuse these same TypeId categories
 * under a mod-defined SubtypeId) can still be typed by hand.
 */
export interface InventoryItem {
  id: string
  name: string
  category: string
}

export const inventoryItems: InventoryItem[] = [
  // --- Ore --------------------------------------------------------------
  { id: 'MyObjectBuilder_Ore/Iron', name: 'Iron Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Nickel', name: 'Nickel Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Cobalt', name: 'Cobalt Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Silicon', name: 'Silicon Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Silver', name: 'Silver Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Gold', name: 'Gold Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Platinum', name: 'Platinum Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Magnesium', name: 'Magnesium Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Uranium', name: 'Uranium Ore', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Stone', name: 'Stone', category: 'Ore' },
  { id: 'MyObjectBuilder_Ore/Ice', name: 'Ice', category: 'Ore' },

  // --- Ingot --------------------------------------------------------------
  { id: 'MyObjectBuilder_Ingot/Iron', name: 'Iron Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Nickel', name: 'Nickel Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Cobalt', name: 'Cobalt Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Silicon', name: 'Silicon Wafer', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Silver', name: 'Silver Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Gold', name: 'Gold Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Platinum', name: 'Platinum Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Magnesium', name: 'Magnesium Powder', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Uranium', name: 'Uranium Ingot', category: 'Ingot' },
  { id: 'MyObjectBuilder_Ingot/Stone', name: 'Gravel', category: 'Ingot' },

  // --- Component ------------------------------------------------------------
  { id: 'MyObjectBuilder_Component/SteelPlate', name: 'Steel Plate', category: 'Component' },
  { id: 'MyObjectBuilder_Component/InteriorPlate', name: 'Interior Plate', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Girder', name: 'Girder', category: 'Component' },
  { id: 'MyObjectBuilder_Component/SmallTube', name: 'Small Steel Tube', category: 'Component' },
  { id: 'MyObjectBuilder_Component/LargeTube', name: 'Large Steel Tube', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Motor', name: 'Motor', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Display', name: 'Display', category: 'Component' },
  { id: 'MyObjectBuilder_Component/BulletproofGlass', name: 'Bulletproof Glass', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Construction', name: 'Construction Component', category: 'Component' },
  { id: 'MyObjectBuilder_Component/MetalGrid', name: 'Metal Grid', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Computer', name: 'Computer', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Reactor', name: 'Reactor Component', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Thrust', name: 'Thruster Component', category: 'Component' },
  { id: 'MyObjectBuilder_Component/GravityGenerator', name: 'Gravity Generator Component', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Medical', name: 'Medical Component', category: 'Component' },
  {
    id: 'MyObjectBuilder_Component/RadioCommunication',
    name: 'Radio-communication Component',
    category: 'Component',
  },
  { id: 'MyObjectBuilder_Component/Detector', name: 'Detector Component', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Explosives', name: 'Explosives', category: 'Component' },
  { id: 'MyObjectBuilder_Component/SolarCell', name: 'Solar Cell', category: 'Component' },
  { id: 'MyObjectBuilder_Component/PowerCell', name: 'Power Cell', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Superconductor', name: 'Superconductor Component', category: 'Component' },
  { id: 'MyObjectBuilder_Component/Canvas', name: 'Canvas', category: 'Component' },
  { id: 'MyObjectBuilder_Component/ZoneChip', name: 'Zone Chip', category: 'Component' },

  // --- Bottle / consumable ---------------------------------------------------
  { id: 'MyObjectBuilder_GasContainerObject/HydrogenBottle', name: 'Hydrogen Bottle', category: 'Bottle' },
  { id: 'MyObjectBuilder_OxygenContainerObject/OxygenBottle', name: 'Oxygen Bottle', category: 'Bottle' },
  { id: 'MyObjectBuilder_ConsumableItem/Medkit', name: 'Medkit', category: 'Consumable' },
  { id: 'MyObjectBuilder_ConsumableItem/Powerkit', name: 'Powerkit', category: 'Consumable' },
]

export const inventoryItemCategories = Array.from(new Set(inventoryItems.map((i) => i.category)))
