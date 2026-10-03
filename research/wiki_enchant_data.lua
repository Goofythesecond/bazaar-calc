return {
	--[[
	Quick Copy:
	
	['Enchant'] = {
		max = #,
		highLevelMark = #,
		desc = '&7Description',
		req = #,
		vars = {
			{#, #},
		},
		applicable = {''},
		cost = {#, #},
		rarity = {'#', '#'},
	},
	]]--

	-- Normal Enchantments
	-- legacy
	['Aiming'] = {
		max = 5,
		desc = '&7Arrows home towards nearby mobs if they are within &a{0} &7blocks.',
		req = 8,
		vars = {
			{2, 4, 6, 8, 10},	
		},
		applicable = {'Bow'},
		cost = {9, 18, 27, 36, 45},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Dragon Hunter'] = {
		max = 5,
		highLevelMark = 1,
		desc = '&7Increases damage dealt to/&7Ender Dragons by &a{0}%&7.',
		req = 16,
		vars = {
			{8, 16, 24, 32, 40},
		},
		applicable = {'Bow', 'Melee Weapon'},
		cost = {18, 36, 55, 73, 91},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Frost Walker'] = {
		max = 2,
		desc = '&7Ice blocks will be created below/&7you when you walk above water in/&7a radius of &a{0} &7blocks.',
		req = 0,
		vars = {
			{1, 2},
		},
		applicable = {'Boots'},
		cost = {15, 30},
		rarity = {'C', 'C'},
		
	},

	['Metallurgy'] = { -- 0.24.4 Removed from Tungsten Collection
		max = 1, -- placeholder
		-- highLevelMark = 0,
		desc = '', -- placeholder
		req = 0, -- placeholder
		vars = {
		},
		cost = {0}, -- placeholder
		rarity = {'C'}, -- placeholder
	},
		
	['Hardened Mana'] = {
		max = 10,
		desc = '&7Gain &a{0}% &7of mana used near you as &a/&aDefense &7for 10 seconds, capped at/&7400 &a Defense&7.',
		req = 22,
		vars = {
			{0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Strong Mana'] = {
		max = 10,
		desc = '&7Gain &a{0}% of mana used near you as &c/&cStrength &7for 10 seconds, capped at/&7100 &c Strength&7.',
		req = 22,
		vars = {
			{0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
		['Ferocious Mana'] = {
		max = 10,
		desc = '&7Gain &a{0}% &7of mana used near you as/&c Ferocity &7for 10 seconds, capped/&7at 50 &c Ferocity&7.',
		req = 22,
		vars = {
			{0.1, 0.1, 0.2, 0.2, 0.2, 0.3, 0.4, 0.4, 0.5, 0.5},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
		
	['Mana Vampire'] = {
		max = 10,
		desc = '&7Heal for &a{0}% &7of mana used near you.',
		req = 22,
		vars = {
			{0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},

	['Sunder'] = {
		max = 6,
		desc = '&7Grants &a+{0} &6 Farming Fortune&7, which/&7increases your chance for multiple/&7crops.',
		req = 2,
		vars = {
			{12.5, 25, 37.5, 50, 62.5, 75},
		},
		applicable = {'Axe'},
		cost = {5, 10, 15, 20, 25, 0}, --No Cost for T6
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Telekinesis'] = {
		max = 1,
		desc = '&7Block and mob drops go directly/&7into your inventory.',
		req = 0,
		cost = {5},
		rarity = {'C'},
		link = 'Telekinesis (Enchantment)',		
	},
	-- Legacy end
	
	['Absorb'] = {
		max = 10,
		noCombine = true,
		desc = '&7Grants &3+{0}☯ Foraging Wisdom &7and/ &6+{1} Foraging Fortune&7.',
		req = 0,
		vars = {
			{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
			{2, 4, 6, 8, 10, 12, 14, 16, 18, 20},
		},
		upgrades = {'1k', '5k', '25k', '100k', '300k', '1.5m', '5m', '25m', '50m', nil},
		upgradeType = 'logs',
		applicable = {'Axe'},
		cost = {10, 10, 10, 10, 10, 10, 10, 10, 10, 10}, -- Assumed as Absorb I is known to have 10 xp apply cost
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},

	['Angler'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Grants &3+{0} Sea Creature Chance&7.',
		req = 4,
		vars = {
			{1, 2, 3, 4, 5, 6},
		},
		applicable = {'Fishing Rod'},
		cost = {10, 20, 30, 40, 50, 75},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Aqua Affinity'] = {
		max = 1,
		desc = '&7Increases your underwater mining/&7rate.',
		req = 0,
		applicable = {'Helmet'},
		cost = {15},
		rarity = {'C'},
	},
	
	['Bane of Arthropods'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases damage dealt to &4Ж/&4Arthropod &7mobs by &a{0}%.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 30, 40, 50},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 15, 20, 25, 30, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Big Brain'] = {
		max = 5, -- Only exists as tiers 3, 4, and 5
		desc = '&7Grants &b+{0} Intelligence&7.',
		req = 21,
		vars = {
			{nil, nil, 15, 20, 25},
		},
		applicable = {'Helmet'},
		cost = {nil, nil, 60, 80, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Blast Protection'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Grants &a+{0}  Defense &7against/&7explosions.',
		req = 0,
		vars = {
			{30, 60, 90, 120, 150, 180, 210},
		},
		applicable = {'Armor'},
		cost = {10, 15, 20, 25, 30, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Blessing'] = {
		max = 6,
		desc = '&7Increases the chance for &6Treasure/&7catches to be &6&lGREAT &7or/&d&lOUTSTANDING &7by &a{0}%.',
		req = 9,
		vars = {
			{2, 4, 6, 8, 10, 12},
		},
		applicable = {'Fishing Rod'},
		cost = {10, 20, 30, 40, 50, 0}, -- No Cost for T6
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
		link = 'Blessing (Enchantment)',
	},
	
    ['Bug Blender'] = {
        max = 5,
        highLevelMark = 5,
        desc = '&7Grants &6+{0} Farming Fortune &7when/&7vacuuming &2Pests&7.',
        req = 0,
        vars = {
            {20, 40, 60, 80, 100}
        },
		applicable = {'Vacuum'},
        cost = {10, 20, 30, 40, 50},
        rarity = {'C', 'C', 'C', 'C', 'U'},
        },

	['Caster'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&a{0}% &7chance to not consume/&7bait.',
		req = 15,
		vars = {
			{5, 10, 15, 20, 25, 30},
		},
		applicable = {'Fishing Rod'},
		cost = {20, 25, 30, 40, 50, 75},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},

	['Cayenne'] = {
		max = 5, -- Only exists as tiers 4 and 5
		desc = '&7Grants &c+{0} Health &7and &f+{1} True/&fDefense &7per digit in your &6Magical/&6Power&7.',
		req = 0,
		vars = {
			{nil, nil, nil, 0.8, 1},
			{nil, nil, nil, 0.4, 0.5},
		},
		applicable = {'Equipment'},
		cost = {nil, nil, nil, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Champion'] = {
		max = 10,
		noCombine = true,
		desc = '&7Gain &a{0}% &7extra Combat XP. The 2nd/&7hit on a mob grants &6+{1} coins &7& &3+{2}/&7exp orbs.',
		req = 0,
		vars = {
			{3, 3.78, 4.56, 5.33, 6.11, 6.89, 7.67, 8.44, 9.22, 10},
			{1.4, 1.8, 2.2, 2.6, 3, 3.4, 3.8, 4.2, 4.6, 5},
			{7, 9, 11, 13, 15, 17, 19, 21, 23, 25},
		},
		upgrades = {'50k', '100k', '250k', '500k', '1m', '1.5m', '2m', '2.5m', '3m', nil},
		upgradeType = 'Combat XP',
		applicable = {'Melee Weapon'},
		cost = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'}, -- Assumed based on Feather Falling/Infinite Quiver
	},

	['Chance'] = {
		max = 5,
		desc = '&7Increases the chance of a Monster/&7dropping an item by/&a{0}%&7.',
		req = 11,
		vars = {
			{15, 30, 45, 60, 75},
		},
		applicable = {'Bow'},
		cost = {15, 30, 45, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Charm'] = {
		max = 6,
		desc = '&7Increases the chance to catch/&7higher-tiered &6Trophies &7by &a{0}%&7.',
		req = 25,
		vars = {
			{2, 4, 6, 8, 10, 12},
		},
		applicable = {'Fishing Rod'},
		cost = {20, 25, 30, 40, 50, 0}, -- Only T6 Endcap
		rarity = {'C','C','C','C','U','L'}, -- There isn't a book for Lvl 6 but the item used to apply it is legendary
	},
	
	['Cleave'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Deals up to &a{0}% &7of your damage/&7dealt to other monsters within &a{1}/&7blocks of the target.',
		req = 4,
		vars = {
			{5, 10, 15, 20, 25, 30},
			{3.5, 4, 4.5, 5, 5.5, 6},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Compact'] = {
		max = 10,
		noCombine = true,
		desc = '&7Gain &3+{0}☯ Mining Wisdom &7and a &a{1}%/&7chance to drop an enchanted item.',
		req = 0,
		vars = {
			{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
			{0.25, 0.27, 0.29, 0.31, 0.33, 0.36, 0.4, 0.44, 0.5, 0.57},
		},
		upgrades = {100, 500, '1.5k', '5k', '15k', '50k', '150k', '500k', '1m', nil},
		upgradeType = 'blocks',
		applicable = {'Mining Tools'},
		cost = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25}, -- Assumed as Compact X is known to have 25 xp apply cost
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'}, -- Assumed based on Feather Falling/Infinite Quiver (Known Compact X is Supreme)
	},

	['Corruption'] = {
		max = 5,
		desc = '&7Gain a &a{0}% &7chance to spawn a/&7Corrupted Sea Creature.',
		req = 25,
		vars = {
			{1, 2, 3, 4, 5},
		},
		applicable = {'Fishing Rod'},
		cost = {20, 25, 30, 40, 50},
		rarity = {'C','C','C','C','U'},
	},

	['Counter-Strike'] = {
		max = 5, -- Only exists as tiers 3, 4, and 5
		desc = '&7Gain &a+{0} Defense &7for &a7s &7on the/&7first hit from an enemy.',
		req = 22,
		vars = {
			{nil, nil, 6, 8, 10}, -- some sources have counter strike 3 and 4, but only 5 is obtainable
		},
		applicable = {'Chestplate'},
		cost = {nil, nil, 60, 80, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Critical'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases &9 Crit Damage &7by &a{0}%&7.',
		req = 9,
		vars = {
			{10, 20, 30, 40, 50, 70, 100},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 75, 100},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Cubism'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Increases damage dealt to &a Cubic/&7mobs by &a{0}%&7.',
		req = 3,
		vars = {
			{5, 10, 15, 20, 30, 40},
		},
		applicable = {'Bow', 'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Cultivating'] = {
		max = 10,
		noCombine = true,
		desc = '&7Gain &3+{0}☯ Farming Wisdom &7and &6+{1}/&6Farming Fortune&7.',
		req = 0,
		vars = {
			{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
			{2, 4, 6, 8, 10, 12, 14, 16, 18, 20},
		},
		upgrades = {'1k', '5k', '25k', '100k', '250k', '1m', '2.5m', '10m', '25m', nil},
		upgradeType = 'crops',
		applicable = {'Farming Tools'},
		cost = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25}, 
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'}, -- Assumed based on Feather Falling/Infinite Quiver (Known Compact X is Supreme)
	},
	
	['Dedication'] = {
		max = 4,
		desc = '&7Grants &6{0} Farming Fortune &7for/&7crops, multiplied by your &aGarden/&7milestone for that crop.',
		req = 12,
		vars = {
			{0.5, 0.75, 1, 2},
		},
		applicable = {'Farming Tool'},
		cost = {20, 25, 30, 100},
		rarity = {'C', 'C', 'C', 'C'},
	},
	
	['Delicate'] = {
		max = 5, -- Only exists as tier 5
		noCombine = true,
		desc = '&7Avoids breaking stems and baby/&7crops.',
		req = 0,
		applicable = {'Farming Tool'},
		cost = {nil, nil, nil, nil, 50},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Depth Strider'] = {
		max = 3,
		desc = '&7Reduces how much you are slowed in/&7the water by &a{0}%&7.',
		req = 0,
		vars = {
			{33, 67, 100},
		},
		applicable = {'Boots'},
		cost = {10, 20, 30},
		rarity = {'C', 'C', 'C'},
	},
	
	['Divine Gift'] = {
		max = 3,
		desc = '&7Grants &b+{0} Magic Find.',
		req = 0,
		vars = {
			{2, 4, 6},
		},
		applicable = {'Bow', 'Melee Weapon'},
		cost = {50, 100, 150},
		rarity = {'C', 'C', 'C'},
	},
	
	['Dragon Tracer'] = {
		max = 5,
		desc = '&7Arrows home towards dragons if/&7they are within &a{0} &7blocks.',
		req = 8,
		vars = {
			{2, 4, 6, 8, 10},
		},
		applicable = {'Bow'},
		cost = {10, 20, 30, 40, 50},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Drain'] = {
		max = 6,
		desc = '&7Regen &4+{0} Vitality &7every time you/&7hit a mob./&8(1s Cooldown).',
		req = 15,
		vars = {
			{0.5, 1, 1.5, 2, 2.5, 3},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 50, 200, nil},
		rarity = {'C', 'C', 'C', 'C', 'U', nil},
	},
	
	['Efficiency'] = {
		max = 10, -- Doesn't go up to 10 in books, only up to 5
		highLevelMark = 6,
		desc = '&7Grants &a+{0} &6 Mining Speed.',
		req = 0,
		vars = {
			{30, 50, 70, 90, 110, 130, 150, 170, 190, 210}, -- Vars are displayed in lore only when on mining islands, added in case we need them, but right now the "default" description is used
		},
		applicable = {'Mining Tools', 'Tools'},
		cost = {10, 15, 20, 25, 30, nil, nil, nil, nil, nil},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Ender Slayer'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases damage dealt to &5 Ender/&7mobs by &a{0}%&7.',
		req = 11,
		vars = {
			{5, 10, 15, 20, 30, 40, 50},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 25, 30, 40, 75, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Execute'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Increases damage dealt by &a{0}% &7for/&7each percent of health missing on/&7your target.',
		req = 14,
		vars = {
			{0.2, 0.4, 0.6, 0.8, 1, 1.25},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 40, 50, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Experience'] = {
		max = 5,
		highLevelMark = 4,
		desc = '&7Grants a &a{0}% &7chance for mobs and/&7ores to drop double experience.',
		req = 0,
		vars = {
			{12.5, 25, 37.5, 50, 62.5},
		},
		cost = {15, 30, 45, 75, 0}, --No Cost for T5
		applicable = {'Melee Weapon', 'Mining Tools'},
		rarity = {'C', 'C', 'C', 'C', 'U'},
		link = 'Experience (Enchantment)',
	},
	
	['Expertise'] = {
		max = 10,
		highLevelMark = 6,
		noCombine = true,
		desc = '&7Grants &3+{0} Sea Creature Chance/&7and &3+{1}☯ Fishing Wisdom&7 when killing/&7Sea Creatures.',
		req = 0,
		vars = {
			{0.6, 1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 6},
			{2, 4, 6, 8, 10, 12, 14, 16, 18, 20},
		},
		upgrades = {50, 100, 250, 500, '1k', '2.5k', '5.5k', '10k', '15k', nil},
		upgradeType = 'kills',
		applicable = {'Fishing Rod'},
		cost = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25}, -- Assumed as Compact I is known to have 25 xp apply cost
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'}, -- Assumed based on Feather Falling/Infinite Quiver (Known Compact X is Supreme)
	},

    ['Feast'] = {
        max = 5,
        highLevelMark = 5,
        desc = '&7Grants &e+{0} Overbloom&7.',
        req = 5,
        vars = {
        	{2, 4, 6, 8, 10},
    	},
        cost = {20, 25, 30, 40, 50},
		applicable = {'Farming Tool'},
        rarity = {'C', 'C', 'C', 'C', 'U'},
    },
	
	['Feather Falling'] = {
		max = 10,
		highLevelMark = 6,
		desc = '&7Increases how high you can fall/&7before taking fall damage by &a{1} &7and/&7reduces fall damage by &a{1}%&7.',
		req = 0,
		vars = {
			{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
			{5, 10, 15, 20, 25, 30, 35, 40, 45, 50},
		},
		applicable = {'Boots'},
		cost = {10, 15, 20, 25, 30, 60, 80, 100, 120, 140},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Vivacious Vitality'] = {
		max = 10,
		desc = '&7Convert &a{0}% &7of &4 Vitality &7used as &e/&eAttack Speed &7for &a10s &8(max 5/&8Attack Speed).',
		req = 22,
		vars = {
			{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Fire Aspect'] = {
		max = 3,
		desc = '&7Ignites your enemies for &a{0}s&7, dealing/&a{1}% &7of your damage per second.',
		req = 0,
		vars = {
			{3, 4, 4},
			{3, 6, 9},
		},
		applicable = {'Melee Weapon'},
		cost = {15, 30, 45},
		rarity = {'C', 'C', 'C'},
	},
	
	['Fire Protection'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Grants &f+{0} True Defense &7against/&7fire and lava.',
		req = 0,
		vars = {
			{2, 4, 6, 8, 10, 12, 14},
		},
		applicable = {'Armor'},
		cost = {10, 15, 20, 25, 30, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['First Strike'] = {
		max = 5,
		highLevelMark = 5,
		desc = '&7Increases melee damage dealt by/&a{0}% &7for the first hit on a mob.',
		req = 10,
		vars = {
			{25, 50, 75, 100, 125},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 30, 40, 75, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Flame'] = {
		max = 2,
		desc = '&7Arrows ignite your enemies for &a{0}s&7,/&7dealing &a{1}% &7of your damage per/&7second.',
		req = 0,
		vars = {
			{3.5, 4},
			{3, 6},
		},
		applicable = {'Bow'},
		cost = {25, 50},
		rarity = {'C', 'C'},
	},
	
	['Forest Pledge'] = {
		max = 6,
		desc = '&7Grants &6+{0} Foraging Fortune&7.',
		req = 12,
		vars = {
			{nil, nil, 6, 8, 10, 12},
		},
		applicable = {'Armor'},
		cost = {nil, nil, 30, 40, 50, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L'},
	},
	
	['Fortune'] = {
		max = 4,
		desc = '&7Grants &6+{0} Mining Fortune&7, which/&7increases your chance for multiple/&7drops.',
		req = 0,
		vars = {
			{10, 20, 30, 45},
		},
		applicable = {'Mining Tools'},
		cost = {15, 30, 45, 0}, -- No Cost for T4
		rarity = {'C', 'C', 'C', 'C'},
	},
	
	['Frail'] = {
		max = 7,
		highLevelMark = 7,
		desc = '&7Sea creatures start with &a{0}%/&7reduced health.',
		req = 14,
		vars = {
			{2.5, 5, 7.5, 10, 12.5, 15, 17.5},
		},
		applicable = {'Fishing Rod'},
		cost = {20, 25, 30, 40, 50, 75, 0}, -- Only T7 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'L'}, -- There isn't a book for Lvl 7 but the item used to apply it is legendary
	},
	
	['Giant Killer'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases damage dealt by &a{0}% &7for/&7each percent of extra health that/&7your target has above you up to &a{1}%&7.',
		req = 8,
		vars = {
			{0.1, 0.2, 0.3, 0.4, 0.6, 0.9, 1.2},
			{5, 10, 15, 20, 30, 45, 65},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},

	['Gravity'] = {
		max = 6,
		desc = '&7Increases damage dealt to /&7Airborne mobs by &a{0}%&7.',
		req = 16,
		vars = {
			{5, 10, 15, 20, 30, 40},
		},
		applicable = {'Bow', 'Melee Weapon'},
		cost = {10, 15, 20, 25, 30, 100},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},

	['Great Spook'] = {
		max = 1,
		highLevelMark = 1,
		desc = '&7Grants &a+1 &5Fear &7on &5Great Spook/&5Armor&7.',
		req = 0,
		applicable = {'Armor'},
		cost = {0},
		rarity = {'C'},
		link = 'Great Spook (Enchantment)',
	},
	
	['Green Thumb'] = {
		max = 5,
		desc = '&7Grants &6+{0} Farming Fortune &7per/&7unique visitor served.',
		req = 24,
		vars = {
			{0.05, 0.1, 0.15, 0.2, 0.25},
		},
		applicable = {'Equipment'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
		link = 'Green Thumb (Enchantment)',
	},
	
	['Growth'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Grants &a+{0} &c Health&7.',
		req = 5,
		vars = {
			{15, 30, 45, 60, 75, 90, 105},
		},
		applicable = {'Armor'},
		cost = {10, 20, 30, 40, 50, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Hardened Vitality'] = {
		max = 10,
		desc = '&7Convert &a{0}% &7of &4 Vitality &7used as &a/&aDefense &7for &a10s &8(max 25 Defense).',
		req = 22,
		vars = {
			{4, 8, 12, 16, 20, 24, 28, 32, 36, 40},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Harvesting'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Grants &a+{0} &6 Farming Fortune&7, which/&7increases your chance for multiple/&7crops.',
		req = 2,
		vars = {
			{12.5, 25, 37.5, 50, 62.5, 75},
		},
		applicable = {'Farming Tool'},
		cost = {5, 10, 15, 20, 25, 0}, -- No cost is listed for tier 6
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},

	['Hecatomb'] = {
		max = 10,
		noCombine = true,
		desc = '&7Gain &a+{0}% &cCatacombs &7XP \\& &a+{1}% &3Class &7XP, doubled on/&b&lS+ &7runs./&7Grants &c+{2} &7per 10 &cCatacombs &7levels.',
		req = 0,
		vars = {
			{0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92, 1},
			{0.56, 0.72, 0.88, 1.04, 1.2, 1.36, 1.52, 1.68, 1.84, 2},
			{2.6, 3.2, 3.8, 4.4, 5, 5.6, 6.2, 6.8, 7.4, 8},
		},
		upgrades = {'2 S', '5 S', '10 S', '20 S', '30 S', '40 S', '60 S', '80 S', '100 S', nil},
		upgradeType = 'runs',
		applicable = {'Helmet'},
		cost = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'}, -- Assumed based on Feather Falling/Infinite Quiver
	},

	['Ice Cold'] = {
		max = 5,
		desc = '&7Grants &b+{0} Cold Resistance&7.',
		req = 30,
		vars = {
			{1, 2, 3, 4, 5},
		},
		applicable = {'Armor'},
		cost = {27, 41, 55, 68, 82},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Impaling'] = {
		max = 5, 
		desc = '&7Increases damage dealt to &9/&9Aquatic &7mobs by &a{0}%&7.',
		req = 12,
		vars = {
			{5, 10, 15, 20, 30},
		},
		cost = {10, 15, 20, 25, 30},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Infinite Quiver'] = {
		max = 10,
		highLevelMark = 6,
		desc = '&7Saves arrows &a{0}% &7of the time when/&7you fire your bow.',
		req = 2,
		vars = {
			{3, 6, 9, 12, 15, 18, 21, 24, 27, 30},
		},
		applicable = {'Bow'},
		cost = {10, 15, 20, 25, 30, 60, 80, 100, 120, 140},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Knockback'] = {
		max = 2,
		desc = '&7Increases knockback by &a{0} &7blocks.',
		req = 0,
		vars = {
			{3, 6},
		},
		cost = {15, 30},
		applicable = {'Melee Weapon'},
		rarity = {'C', 'C'},
		link = 'Knockback (Enchantment)',
	},

	['Lapidary'] = {
		max = 5,
		desc = '&7Grants &6+{0} Gemstone Fortune &7and/&6+{1} Mining Speed &7while mining/&7Gemstones.',
		req = 22,
		vars = {
			{10, 20, 30, 40, 50},
			{20, 40, 60, 80, 100},
		},
		applicable = {'Mining Tools'},
		cost = {25, 50, 100, 150, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Lethality'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Reduces the &a Defense &7of your/&7target by &a{0}% for &64s &7each time you/&7hit them with melee. Stacks up to &a4/&7times.',
		req = 14,
		vars = {
			{1.2, 2.4, 3.6, 4.8, 6, 9},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 40, 50, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Life Steal'] = {
		max = 6,
		highLevelMark = 4,
		desc = '&7Heal &c{0} &7every time you hit a mob.',
		req = 5,
		vars = {
			{2.4, 4.8, 7.2, 9.6, 12, 14.4},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 50, 200, nil},
		rarity = {'C', 'C', 'C', 'C', 'U', nil},
	},
	
	['Looting'] = {
		max = 5,
		highLevelMark = 4,
		desc = '&7Increases the chance of a Monster/&7dropping an item by &a{0}%&7.',
		req = 0,
		vars = {
			{15, 30, 45, 60, 75},
		},
		applicable = {'Fishing Rod', 'Melee Weapon'},
		cost = {15, 30, 45, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Luck'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases the chance for Monsters/&7to drop their armor by/&a{0}%&7.',
		req = 3,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 75, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Luck of the Sea'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Grants &6+{0} Treasure Chance&7, which/&7increases the chance of fishing/&7treasure.',
		req = 0,
		vars = {
			{0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5},
		},
		applicable = {'Fishing Rod'},
		cost = {10, 15, 20, 25, 30, 50, 0}, -- Only T7 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'L'}, -- There isn't a book for Lvl 7 but the item used to apply it is legendary
	},
	
	['Lure'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Shortens the maximum time it takes to/&7catch something by &a{0}%&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30},
		},
		applicable = {'Fishing Rod'},
		cost = {10, 15, 20, 25, 30, 50},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Pyroclasm'] = {
		max = 6,
		desc = '&7Increases damage dealt to &c/&cMagmatic &7mobs by &a{0}%&7.',
		req = 9,
		vars = {
			{10, 20, 30, 40, 60, 80},
		},
		cost = {10, 15, 20, 25, 30, 100},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Magnet'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Grants &a{0} &7additional experience orbs/&7every time you successfully catch a/&7fish.',
		req = 13,
		vars = {
			{1, 2, 3, 4, 5, 6},
		},
		applicable = {'Fishing Rod'},
		cost = {20, 25, 30, 40, 50, 75},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},

	['Mana Steal'] = {
		max = 3,
		highLevelMark = 1,
		desc = '&7Regain &b{0}% &7of your mana on hit.',
		req = 20,
		vars = {
			{0.25, 0.5, 0.75},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30},
		rarity = {'C', 'C', 'C'},
	},
	
	['Vampiric Vitality'] = {
		max = 10,
		desc = '&7Heal for &c{0} &7per &4 Vitality &7used.',
		req = 22,
		vars = {
			{0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Overload'] = {
		max = 5,
		desc = '&7Increases &9 Crit Damage &7by &a{0}% &7and/&9☣ Crit Chance &7by &a{0}%&7. Having a/Critical chance above &9100% &7grants a/chance to perform a Mega Critical Hit/&7dealing &9{1}% &7extra damage.',
		req = 33,
		vars = {
			{1, 2, 3, 4, 5}, -- Vars 1 and 2 are identical
			{10, 20, 30, 40, 50},
		},
		applicable = {'Bow'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Paleontologist'] = {
		max = 5,
		desc = '&7Increases chances of finding a/&9Suspicious Scrap &7when mining in/&bGlacite Mineshafts &7by &a{0}%&7.',
		req = 27,
		vars = {
			{2.5, 5, 7.5, 10, 12.5},
		},
		applicable = {'Mining Tools'},
		cost = {23, 45, 91, 136, 179},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Pesterminator'] = {
		max = 6,
		desc = '&7Grants &6+{0} Farming Fortune &7and/&2+{1} Bonus Pest Chance&7, which/&7increases your chance to spawn/&7bonus &2 Pests &7on &athe Garden&7.',
		req = 10,
		vars = {
			{2, 4, 6, 8, 10, 12},
			{1, 2, 3, 4, 5, 6},
		},
		applicable = {'Armor'},
		cost = {5, 9, 13, 18, 23, 0}, -- Only T6 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'U'},
	},

	['Petalfall'] = {
        max = 5,
        desc = '&7Grants &4+{0}  Timber&7.',
        req = 12,
        vars = {
        	{0.2, 0.4, 0.6, 0.8, 1},
    	},
        cost = {25, 50, 75, 100, 150},
		applicable = {'Axe'},
        rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Piercing'] = {
		max = 1,
		desc = '&7Arrows travel through enemies. The/&7extra targets hit take &a25% &7of the/&7damage.',
		req = 17,
		applicable = {'Bow'},
		cost = {30},
		rarity = {'C'},
	},
	
	['Piscary'] = {
		max = 7,
		desc = '&7Grants &b+{0} Fishing Speed&7.',
		req = 8,
		vars = {
			{1, 2, 3, 4, 5, 6, 7},
		},
		applicable = {'Fishing Rod'},
		cost = {8, 16, 24, 36, 48, 60, 0}, -- Only T7 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'L'}, -- There isn't a book for Lvl 7 but the item used to apply it is legendary
	},
	
	['Power'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases bow damage by &a{0}%&7.',
		req = 0,
		vars = {
			{8, 16, 24, 32, 40, 50, 65},
		},
		applicable = {'Bow'},
		cost = {10, 20, 30, 40, 50, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Prismatic'] = {
		max = 5,
		desc = '&7Grants &5+{0}  Pristine&7, which/&7increases the chance to improve the/&7quality of dropped &dGemstones&7.',
		req = 22,
		vars = {
			{0.5, 1, 1.5, 2, 2.5},
		},
		applicable = {'Mining Tools'},
		cost = {25, 50, 100, 150, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
		link = 'Prismatic'
	},
	
	['Projectile Protection'] = {
		max = 7,
		desc = '&7Grants &a+{0}  Defense &7against/&7projectiles.',
		req = 0,
		vars = {
			{7, 14, 21, 28, 35, 42, 49},
		},
		applicable = {'Armor'},
		cost = {10, 15, 20, 25, 30, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},

	['Prosecute'] = {
		max = 6,
		highLevelMark = 6,
		desc = '&7Increases damage dealt by &a{0}% &7for/&7each percent of health your target/&7has.',
		req = 25,
		vars = {
			{0.1, 0.2, 0.3, 0.4, 0.7, 1},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 40, 50, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},

	['Prosperity'] = {
		max = 5,
		desc = '&7Grants &a+{0} &c Health&7.',
		req = 0,
		vars = {
			{3, 6, 9, 12, 15},
		},
		applicable = {'Equipment'},
		cost = {100, 100, 100, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Protection'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Grants &a+{0}  Defense&7.',
		req = 0,
		vars = {
			{4, 8, 12, 16, 20, 25, 30},
		},
		applicable = {'Armor'},
		cost = {10, 15, 20, 25, 30, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Punch'] = {
		max = 2,
		desc = '&7Increases arrow knockback by &a{0}/&7blocks.',
		req = 0,
		vars = {
			{3, 6},
		},
		applicable = {'Bow'},
		cost = {15, 30},
		rarity = {'C', 'C'},
	},

	['Quantum'] = {
		max = 5, --Only exists as tiers 3, 4, and 5
		desc = '&7Grants &4+{0} Vitality &7on weekdays and/&3+{1}☯ &7of a random &3Wisdom &7stat on/&7weekends.',
		req = 0,
		vars = {
			{nil, nil, 1, 2, 3},
			{nil, nil, 1.2, 1.6, 2},
		},
		applicable = {'Necklace'},
		cost = {nil, nil, 50, 50, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Quick Bite'] = {
		max = 5,
		desc = '&7Makes fish swim &a{0}% &7faster towards/&7your bobber.',
		req = 23,
		vars = {
			{5, 10, 15, 20, 25},
		},
		applicable = {'Fishing Rod'},
		cost = {18, 23, 27, 36, 45},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Rainbow'] = {
		max = 3,
		desc = '{0}',
		req = 6,
		vars = {
			{
				'&7Causes sheep to drop a random wool/&7color when sheared.',
				'&7Grants an &a50%% &7chance to change the/&7color of a sheep when shearing it.',
				'&7Grants an &a80%% &7chance to change the/&7color of a sheep when shearing it,/&7which will also flip it, of course.'
			},
		},
		applicable = {'Shears'},
		cost = {10, 0, 0}, -- No Cost for T2 T3
		rarity = {'C', 'C', 'C'},
	},

	['Reflection'] = {
		max = 5,
		desc = '&7Grants &b+{0} Intelligence&7./&7Grants &f+{1} True Defense&7./&7When damaged by an arrow, deal &b{2}x &7your&b/&bintelligence &7to its shooter.',
		req = 24,
		vars = {
			{2, 4, 6, 8, 10},
			{1, 2, 3, 4, 5},
			{2, 5, 10, 20, 30},
		},
		applicable = {'Chestplate'},
		cost = {20, 40, 60, 80, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Rejuvenate'] = {
		max = 5,
		desc = '&7Grants &c+{0} Health Regen&7.',
		req = 10,
		vars = {
			{1, 2, 3, 4, 5},
		},
		applicable = {'Armor'},
		cost = {10, 20, 30, 40, 50},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Replenish'] = {
		max = 1,
		highLevelMark = 1,
		desc = '&7Upon breaking crops, nether wart,/&7cocoa, wild rose, or sunflower,/&7automatically replant from materials/&7in your inventory.',
		req = 7,
		applicable = {'Farming Tool'},
		cost = {50},
		rarity = {'R'},
	},
	
	['Respiration'] = {
		max = 4,
		desc = '&7Grants &3+{0} Respiration&7, which/&7increases the amount of time you/&7can stay under water.',
		req = 0,
		vars = {
			{15, 30, 45, 60},
		},
		applicable = {'Helmet'},
		cost = {10, 20, 30, 40},
		rarity = {'C', 'C', 'C', 'C'},
		link = 'Respiration (Enchantment)',		
	},

	['Respite'] = {
		max = 5,
		desc = '&7Grants &c+{0} Health Regen &7while out/&7of combat.',
		req = 23,
		vars = {
			{3, 6, 9, 12, 15},
		},
		applicable = {'Armor'},
		cost = {10, 20, 30, 40, 50},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Scavenger'] = {
		max = 6,
		highLevelMark = 4,
		desc = '&7Scavenge &6{0} Coins &7per monster/&7level on kill.',
		req = 1,
		vars = {
			{0.3, 0.6, 0.9, 1.2, 1.5, 1.8},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 0}, -- Only T6 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'L'}, -- There isn't a book for Lvl 6 but the item used to apply it is legendary
	},

	['Scuba'] = {
		max = 6,
		desc = '&7Grants &9+{0} Pressure Resistance&7.',
		req = 5,
		vars = {
			{1, 2, 3, 4, 5, 6},	
		},
		applicable = {'Armor'},
		cost = {10, 20, 30, 40, 50, 0}, -- Only T6 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'L'},-- There isn't a book for Lvl 6 but the item used to apply it is legendary
	},
	
	['Sharpness'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases melee damage dealt by &a{0}%&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 30, 40, 50},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 15, 20, 25, 30, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Silk Touch'] = {
		max = 1,
		desc = '&7Allows you to collect normally/&7unobtainable block drops.',
		req = 0,
		applicable = {'Mining Tools'},
		cost = {10},
		rarity = {'C'},
	},

	['Small Brain'] = {
		max = 5,
		desc = '&7Grants &b-{0} Intelligence &7and &f+{1}/&fTrue Defense&7.',
		req = 21,
		vars = {
			{nil, nil, 15, 20, 25},
			{nil, nil, 1, 2, 3},
		},
		applicable = {'Helmet'},
		cost = {nil, nil, 60, 80, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Smarty Pants'] = {
		max = 5,
		highLevelMark = 1,
		desc = '&7Grants &b+{0} Intelligence&7.',
		req = 21,
		vars = {
			{5, 10, 15, 20, 25},
		},
		applicable = {'Leggings'},
		cost = {20, 40, 60, 80, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Smelting Touch'] = {
		max = 1,
		desc = '&7Automatically smelts broken blocks/&7into their smelted form.',
		req = 0,
		applicable = {'Mining Tools'},
		cost = {5},
		rarity = {'C'},
	},
	
	['Smite'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases damage dealt to &f/&fSkeletal&7, &2 Undead &7and &8 Wither/&7mobs by &a{0}%&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 30, 40, 50},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 15, 20, 25, 30, 100, 200}, -- Only T7 Endcap, had book before
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},

	['Smoldering'] = {
		max = 5,
		desc = '&7Increases damage dealt to &4/&4Infernal &7mobs by &a{0}%&7.',
		req = 23,
		vars = {
			{5, 10, 15, 20, 30},
		},
		applicable = {'Bow', 'Melee Weapon'},
		cost = {10, 20, 30, 40, 50},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Snipe'] = {
		max = 4,
		highLevelMark = 4,
		desc = '&7Arrows deal &a+{0}% &7damage for every/&a10 blocks travelled.',
		req = 6,
		vars = {
			{1, 2, 3, 4},
		},
		applicable = {'Bow'},
		cost = {20, 25, 30, 0}, -- Tier 4 has no listed cost
		rarity = {'C', 'C', 'C', 'C'},
	},
	
	['Spiked Hook'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Fishing rod deals &a{0}% &7more damage/&7to monsters.',
		req = 18,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		applicable = {'Fishing Rod'},
		cost = {10, 20, 30, 40, 50, 75, 0}, -- Only T7 Endcap
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'L'}, -- There isn't a book for Lvl 7 but the item used to apply it is legendary
	},
	
	['Stealth'] = {
		max = 6,
		desc = '&e Timid &7mobs have a &a{0}% &7chance to/&7remain still instead of fleeing.',
		req = 0, 
		vars = {
			{10, 20, 30, 40, 50, 60}
		},
		applicable = {'Boots'},
		cost = {10, 20, 30, 40, 50, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L'},
	},

	['Strong Vitality'] = {
		max = 10,
		desc = '&7Convert &a{0}% &7of &4 Vitality &7used as &c/&cStrength &7for &a10s &8(max 15 Strength).',
		req = 22,
		vars = {
			{2, 4, 6, 8, 10, 12, 14, 16, 18, 20},
		},
		applicable = {'Armor'},
		cost = {30, 45, 60, 75, 90, 180, 240, 300, 360, 420},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'},
	},
	
	['Sugar Rush'] = {
		max = 3,
		highLevelMark = 1,
		desc = '&7Grants &a+{0} &f Speed&7.',
		req = 7,
		vars = {
			{2, 4, 6},
		},
		applicable = {'Boots'},
		cost = {20, 25, 30},
		rarity = {'C', 'C', 'C'},
	},

	['Tabasco'] = {
		max = 3, -- Only exists as tiers 2 and 3
		desc = '&7Grants &f+{0} &7weapon damage if you/&7don\'t have a &5Dragon &7pet equipped.',
		req = 0,
		vars = {
			{nil, 2, 3},	
		},
		applicable = {'Melee Weapon', 'Weapons'},
		cost = {nil, 300, 500},
		rarity = {'C', 'C', 'C'},
	},
	
	['Thorns'] = {
		max = 4,
		desc = '&7Grants a &a50% &7chance to rebound &a{0}%/&7damage dealt back at the attacker.',
		req = 0,
		vars = {
			{3, 6, 9, 12},
		},
		applicable = {'Armor'},
		cost = {15, 30, 45, 0}, -- Only T4 Endcap
		rarity = {'C', 'C', 'C', 'L'},-- There isn't a book for Lvl 4 but the item used to apply it is legendary
	},

	['Thunderbolt'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Every &c3 &7hits on a monster, strike/&elightning&7, dealing &a{0}% &7of the hit\'s/&7damage to up to 10 monsters within 2/&7blocks.',
		req = 20,
		vars = {
			{4, 8, 12, 16, 20, 25, 30},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 40, 50, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Thunderlord'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Every &c3 &7hits on a monster, strike/&elightning&7, dealing &a{0}% &7of the hit\'s/&7damage.',
		req = 14,
		vars = {
			{8, 16, 24, 32, 40, 50, 60},
		},
		applicable = {'Melee Weapon'},
		cost = {9, 13, 18, 23, 27, 91, 179},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},

	['Tidal'] = {
		max = 3,
		desc = '&7Increases your &a Defense &7by &a+{0}%/&7against Sea Creatures.',
		req = 13,
		vars = {
			{5, 10, 15},
		},
		applicable = {'Leggings'},
		cost = {25, 40, 55},
		rarity = {'C', 'C', 'C'},
	},

	['Titan Killer'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Increases damage dealt by &a{0}% &7for/&7every 100 defense your target has/&7up to &a{1}%&7.',
		req = 28,
		vars = {
			{2, 4, 6, 8, 10, 12, 14},
			{6, 12, 18, 24, 40, 60, 80},
		},
		applicable = {'Melee Weapon'},
		cost = {10, 20, 30, 40, 50, 100, 200},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},

	['Toxophilite'] = {
		link = 'Toxophilite (Enchantment)',
		max = 10,
		noCombine = true,
		desc = '&7Gain &a{0}% &7extra Combat XP. Grants/&9+{1}☣ Crit Chance&7.',
		req = 0,
		vars = {
			{3, 3.78, 4.56, 5.33, 6.11, 6.89, 7.67, 8.44, 9.22, 10}, --Both assumed based on Champion
			{3.7, 4.4, 5.1, 5.8, 6.5, 7.2, 7.9, 8.6, 9.3, 10},
		},
		upgrades = {'50k', '100k', '250k', '500k', '1m', '1.5m', '2m', '2.5m', '3m', nil},
		upgradeType = 'Combat XP',
		applicable = {'Bow'},
		cost = {25, 25, 25, 25, 25, 25, 25, 25, 25, 25},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E', 'L', 'M', 'M'}, -- Assumed based on Feather Falling/Infinite Quiver
	},

	['Transylvanian'] = {
		max = 5,
		desc = '&7Heal &c{0}&7\\/s per enemy within &a10/&7blocks, up to &c{1}&7\\/s.',
		req = 0,
		vars = {
			{nil, nil, nil, 2, 3},
			{nil, nil, nil, 20, 30},
		},
		applicable = {'Helmet'},
		cost = {nil, nil, nil, 100, 150},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Triple-Strike'] = {
		max = 5,
		highLevelMark = 5,
		desc = '&7Increases melee damage dealt by/&a{0}% &7for the first three hits on a mob.',
		req = 19,
		vars = {
			{10, 20, 30, 40, 50},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 30, 40, 75, 200},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['True Protection'] = {
		max = 1,
		highLevelMark = 1,
		desc = '&7Grants &f+5 True Defense&7.',
		req = 15,
		applicable = {'Chestplate'},
		cost = {40},
		rarity = {'C'},
	},
	
	['Turbo-Cacti'] = {
		max = 7,
		desc = '&7Grants &6+{0} Cactus Fortune.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Cactus',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	['Turbo-Cane'] = {
		max = 7,
		desc = '&7Grants &6+{0} Sugar Cane Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Sugar Cane',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Carrot'] = {
		max = 7,
		desc = '&7Grants &6+{0} Carrot Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Carrot',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Cocoa'] = {
		max = 7,
		desc = '&7Grants &6+{0} Cocoa Beans Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Cocoa Beans',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	-- Not an actual enchant, but needed to work properly with {{EnchantmentPageRow}}
	['Turbo-Crop'] = {
		max = 7,
		desc = '&7Grants &a+{0} &6 Farming Fortune/&7when breaking the specified crop.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Example',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Melon'] = {
		max = 7,
		desc = '&7Grants &6+{0} Melon Slice Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Melon Slice',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},

	['Turbo-Moonflower'] = {
		max = 7,
		desc = '&7Grants &6+{0} Moonflower Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Moonflower',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Mushrooms'] = {
		max = 7,
		desc = '&7Grants &6+{0} Mushroom Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Mushrooms',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Potato'] = {
		max = 7,
		desc = '&7Grants &6+{0} Potato Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Potato',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Pumpkin'] = {
		max = 7,
		desc = '&7Grants &6+{0} Pumpkin Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Pumpkin',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Rose'] = {
		max = 7,
		desc = '&7Grants &6+{0} Wild Rose Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Wild Rose',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Sunflower'] = {
		max = 7,
		desc = '&7Grants &6+{0} Sunflower Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Sunflower',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},	
	
	['Turbo-Warts'] = {
		max = 7,
		desc = '&7Grants &6+{0} Nether Wart Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Nether Warts',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Turbo-Wheat'] = {
		max = 7,
		desc = '&7Grants &6+{0} Wheat Fortune&7.',
		req = 0,
		vars = {
			{5, 10, 15, 20, 25},
		},
		awardReq = {nil, nil, nil, '&cBronze', '&fSilver'},
		contest = 'Wheat',
		applicable = {'Farming Tool'},
		cost = {10, 20, 30, 40, 50, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'L', 'M'},
	},
	
	['Vampirism'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Heal &c{0} &7every time you kill a mob./&8(0.5s Cooldown).',
		req = 15,
		vars = {
			{5, 10, 15, 20, 25, 30, 35},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 40, 50, 200, nil},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', nil},
	},
	
	['Venomous'] = {
		max = 7,
		highLevelMark = 6,
		desc = '&7Reduces the target\'s walk speed by/&a{0}% &7and deals &2+{1}% &7of your damage/&7per second per hit, stacking globally/&7up to &240 &7hits. Lasts &65s&7.',
		req = 17,
		vars = {
			{2, 4, 6, 8, 12, 15, 20},
			{0.2, 0.4, 0.6, 0.8, 1.2, 1.6, 2.0},
		},
		applicable = {'Melee Weapon'},
		cost = {20, 25, 30, 40, 50, 200, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R', 'E'},
	},
	
	['Vicious'] = {
		max = 5, -- Only exists as tiers 3, 4, and 5
		desc = '&7Grants &c+{0} Ferocity&7.',
		req = 26,
		vars = {
			{nil, nil, 3, 4, 5},
		},
		applicable = {'Bow', 'Melee Weapon'},
		cost = {nil, nil, 60, 80, 100},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Woodsplitter'] = {
		max = 6,
		desc = '&7Increases damage dealt to &2/&2Woodland &7mobs by &a{0}%&7.',
		req = 5,
		vars = {
			{5, 10, 15, 20, 30, 40},
		},
		applicable = {'Axe'},
		cost = {10, 15, 20, 25, 30, 100},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	['Karma'] = {
		max = 6,
		desc = '&7Grants a &a{0}% &7chance for &2Tree Gifts/&7to contain double loot.',
		req = 0,
		vars = {
			{1, 2, 3, 4, 5, 6},
		},
		applicable = {'Axe'},
		cost = {0, 0, 0, 0, 0, 0},
		rarity = {'C', 'C', 'C', 'C', 'U', 'R'},
	},
	
	-- Ultimate Enchantments
	['Bank'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Saves &6{0}% &7of your coins on death./&7Additionally, enemies drop &6+{1} coins/&7when killed.',
		req = 16,
		vars = {
			{10, 20, 30, 40, 50},
			{0.5, 1.0, 1.5, 2.0, 2.5},
		},
		cost = {50, 100, 150, 200, 250},
		applicable = {'Armor'},
		rarity = {'C', 'C', 'C', 'C', 'U'},
		link = 'Bank (Enchantment)',
	},

	['Bobbin\' Time'] = {
		max = 5, -- Only exists as tiers 3, 4 and 5.
		isUltimate = true,
		desc = '&7Increases all &bFishing Stats &7and &b Magic Find &7by/&b+{0}% &7per fishing bobber within &a30 blocks&7, up to &b5/&7bobbers.',
		req = 24,
		vars = {
			{nil, nil, 0.6, 0.8, 1},
		},
		applicable = {'Armor'},
		cost = {nil, nil, 100, 120, 140},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Chimera'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Copies &a{0}% &7of your active pet\'s stats.',
		req = 31,
		vars = {
			{20, 40, 60, 80, 100},
		},
		applicable = {'Melee Weapon'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Combo'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Increases your damage by &c+{0}% &7per/&7kill up to &a{1} &7kills within &a{1}s&7.',
		req = 24,
		vars = {
			{1, 2, 3, 4, 5},
			{2, 4, 6, 8, 10},
		},
		applicable = {'Melee Weapon'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Crop Fever'] = {
		max = 5,
		isUltimate = true,
		desc = '&7When breaking crops, there is a/&a{0}% &7chance to trigger &d&lCrop/&d&lFever &7for &a60s &7which grants:/&8- &7Additional crop rolls/&8- &e+15 Overbloom/&8- &6+100 Farming Fortune',
		req = 32,
		vars = {
			{0.001, 0.002, 0.003, 0.004, 0.005},
		},
		applicable = {'Farming Tool'},
		cost = {45, 91, 136, 179, 223},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Duplex'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Shoot a second arrow dealing &c{0}% &7of the/&7first arrow\'s damage./&7Targets hit take &c{1}x &7fire/&7damage for &a60s&7.',
		req = 28,
		vars = {
			{4, 8, 12, 16, 20},
			{1.1, 1.2, 1.3, 1.4, 1.5},
		},
		applicable = {'Bow'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Fatal Tempo'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Attacking increases your &c Ferocity/&7by &c{0}% &7per hit, capped at &c200% &7for 3/&7seconds after your last attack.',
		req = 37,
		vars = {
			{10, 20, 30, 40, 50},	
		},
		applicable = {'Melee Weapon', 'Weapons'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['First Impression'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Grants &2+{0} Sweep &7on melee Log/&7Breaks, and your first melee Log/&7Break on a tree grants you &2+{1}/&2Sweep&7.',
		req = 14,
		vars = {
			{1, 2, 3, 4, 5},
			{2, 4, 6, 8, 10},
		},
		applicable = {'Axe'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Flash'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Gain a &a{0}% &7chance to instantly attract/&7a fish.',
		req = 30,
		vars = {
			{1, 2, 3, 4, 5},
		},
		applicable = {'Fishing Rod'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Flowstate'] = {
		max = 3,
		isUltimate = true,
		desc = '&7Consecutive blocks broken grant/&6+{0} Mining Speed&7. Stops after &a10s/&7of not mining and caps at &a200 &7blocks.',
		req = 15,
		vars = {
			{1, 2, 3},
		},
		applicable = {'Mining Tools'},
		cost = {50, 100, 150},
		rarity = {'C', 'C', 'C'},
	},
	
	['Habanero Tactics'] = {
		max = 5, -- Only exists as tiers 4 and 5.
		isUltimate = true,
		desc = '&8ℏ &7Heal &a+{0}% &7more from wands./&8ℏ &7Deal &c+{1}% damage &7with Slayer weapons./&8ℏ &7Gain &3+{3}☯ Combat Wisdom &7with Slayer/&7weapons./&8ℏ &7With &aSmoldering Polarization&7, gain &b{3}/&bMagic Find &7on your slayer weapon.',
		req = 0,
		vars = {
			{nil, nil, nil, 6, 7.5},
			{nil, nil, nil, 20, 25},
			{nil, nil, nil, 2.5, 5},
			{nil, nil, nil, 10, 15},
		},
		applicable = {'Armor'},
		cost = {nil, nil, nil, 250, 300},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Inferno'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Every &c10th &7hit on a mob traps it for/&c5s &7and deals &c{0}x &7of that hit\'s/&7damage over the trap duration.',
		req = 37,
		vars = {
			{1.25, 1.5, 1.75, 2, 2.25},	
		},
		applicable = {'Melee Weapon', 'Weapons'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Last Stand'] = {
		max = 5,
		isUltimate = true,
		desc = '&7When falling below &c40%  Health&7:/&8- &7Gain &a+{0}%  Defense &7for &a10s&7./&8- &7Regen &4{1} Vitality&7./&8Cooldown: 30s',
		req = 30,
		vars = {
			{2.5, 5, 7.5, 10, 12.5},
			{2, 4, 6, 8, 10},			
		},
		applicable = {'Armor'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Legion'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Increases all &cCombat &7stats and &b/&bMagic Find &7by &e{0}% &7per player within/&b30 &7blocks of you, up to &c20 &7players.',
		req = 34,
		vars = {
			{0.07, 0.14, 0.21, 0.28, 0.35},
		},
		applicable = {'Armor'},
		cost = {50, 100, 150, 200, 250}	,
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Missile'] = {
		max = 5,
		isUltimate = true,
		desc = '&7The Log penalty on Throwing Axe is/&7reduced by &a{0}%&7.',
		req = 14,
		vars = {
			{10, 20, 30, 40, 50},
		},
		applicable = {'Axe'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['No Pain No Gain'] = {
		max = 5,
		isUltimate = true,
		desc = '&7You have &e{0}% &7chance to gain &b10/&7experience orbs every time you take/&7hits from mobs.',
		req = 29,
		vars = {
			{20, 40, 60, 80, 100},
		},
		applicable = {'Armor'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['One For All'] = {
		max = 1,
		noCombine = true,
		isUltimate = true,
		desc = '&7Removes all other enchants but/&7increases your weapon damage by &a500%&7.',
		req = 0,
		applicable = {'Longsword', 'Sword'},
		cost = {50},
		rarity = {'C'},
		
	},
	
	['Refrigerate'] = { 
		max = 5,
		isUltimate = true,
		desc = '&7Convert &a{0}% &7of the &b Mana &7used as &a/&aDefense &7for &a10s&7./&8(Max 150 Defense)',
		req = 20,
		vars = {
			{3, 3.75, 4.5, 5.25, 6},
		},
		applicable = {'Armor'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Rend'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Use Left Click ability to rip your/&7arrows out of nearby enemies. Each/&7arrow deals &c{0}% &7of your last critical/&7shot on the target, up to &c5 &7arrows./&a2s &7Cooldown.',
		req = 32,
		vars = {
			{5, 10, 15, 20, 25},
		},
		applicable = {'Bow'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Soul Eater'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Your weapon gains &c{0}x &7the Mob/&7Damage of the latest monster killed/&7and adds it as &c Strength &7on your/&7next critical hit. &8(Max 5k outside/&8Dungeons).',
		req = 36,
		vars = {
			{2, 4, 6, 8, 10},
		},
		applicable = {'Bow', 'Longsword', 'Sword'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['Sunset'] = {
		max = 5,
		isUltimate = true,
		desc = '&7During the day, &e+{0}  Overbloom&7./&7During the night, &b-{1}% Visitor Cooldown&7.',
		req = 27,
		vars = {
			{1, 2, 3, 4, 5},
            {1, 2, 3, 4, 5},
		},
		applicable = {'Armor'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Swarm'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Increases your damage by &c{0}% &7for/&7each enemy within &e10 &7blocks. Maximum of/&c10 &7enemies.',
		req = 35,
		vars = {
			{2, 4, 6, 8, 10},
		},
		applicable = {'Bow', 'Longsword', 'Sword'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},

	['The One'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Grants &c+{0} Health &7and &c+{1}/&cStrength &7per maxed out collection./&7You have &a# collections &7maxed.',
		req = 25,
		vars = {
			{nil, nil, nil, 0.5, 1},
			{nil, nil, nil, 0.1, 0.2},
		},
		applicable = {'Necklace'},
		cost = {0, 0, 0, 250, 300},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Ultimate Jerry'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Increases the base damage of/&fAspect of the Jerry &7by &a{0}%&7.',
		req = 18,
		vars = {
			{1000, 2000, 3000, 4000, 5000},
		},
		applicable = {'&aAspect of the Jerry, Signature Edition', '&fAspect of the Jerry'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Ultimate Wise'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Reduces the ability mana cost of this/&7item by &a{0}%&7.',
		req = 20,
		vars = {
			{10, 20, 30, 40, 50},
		},
		applicable = {'Held Item', '&6Precursor Eye'},
		cost = {50, 100, 150, 200, 250},
		rarity = {'C', 'C', 'C', 'C', 'U'},
	},
	
	['Wisdom'] = {
		max = 5,
		isUltimate = true,
		desc = '&7Gain &b{0} &7Intelligence for every &b5/&7levels of exp you have on you./&7Capped at &b{1} &7Intelligence.',
		req = 27,
		vars = {
			{1, 2, 3, 4, 5},
			{20, 40, 60, 80, 100},
		},
		cost = {50, 100, 150, 200, 250},
		applicable = {'Armor'},
		rarity = {'C', 'C', 'C', 'C', 'U'},
		link = 'Wisdom (Enchantment)',
	},
}