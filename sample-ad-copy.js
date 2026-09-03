const AREAS = {
  Lusaka: ['Kamwala', 'Kabulonga', 'Woodlands', 'Chelston', 'Chilenje', 'Makeni', 'Roma'],
  Kitwe: ['Nkana East', 'Parklands', 'Riverside', 'Buchi', 'Nkana West'],
  Ndola: ['Kansenshi', 'Northrise', 'Masala', 'Itawa', 'Kaniki'],
  Livingstone: ['Dambwa', 'Hillcrest', 'Maramba', 'Town centre'],
  Chipata: ['Kapata', 'Kalongwezi', 'Kalongola', 'Town centre'],
  Kabwe: ['Highridge', 'Luangwa', 'Bwacha', 'Mine area'],
  Chingola: ['Kabundi', 'Chiwempala', 'Town centre', 'Nchanga'],
  Solwezi: ['Kyawama', 'Urban', 'Kandundu', 'Weighbridge'],
  Kasama: ['Location', 'Central', 'Misamfu', 'New Town'],
  Mongu: ['Malengwa', 'Limulunga road', 'Town centre', 'Mongu harbour'],
};

const TOWN_LIST = Object.keys(AREAS);

function townIndex(town) {
  const i = TOWN_LIST.indexOf(town);
  return i < 0 ? 0 : i;
}

function areaFor(town, salt) {
  const list = AREAS[town] || AREAS.Lusaka;
  let n = townIndex(town) * 11;
  const s = String(salt || '');
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i);
  return list[Math.abs(n) % list.length];
}

function pickup(town, salt) {
  return `You can come and check it in ${areaFor(town, salt)}, ${town}. Test before you pay. Cash on pickup.`;
}

function nFrom(salt, town, min, max) {
  let n = townIndex(town) * 13;
  const s = String(salt || '');
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) * (i + 1);
  const span = max - min + 1;
  return min + (Math.abs(n) % span);
}

const PHONE_COLOURS = ['black', 'blue', 'silver', 'green', 'gold'];

function phoneColour(name, town) {
  return PHONE_COLOURS[nFrom(name, town, 0, PHONE_COLOURS.length - 1)];
}

function batteryPct(name, town) {
  return nFrom(name, town, 79, 94);
}

const BASE_COPY = {
  'iPhone 13': (town) =>
    `iPhone 13, 128GB, midnight. Battery health is about 86%. Face ID works. No iCloud lock, you can put your own Apple ID.\n\nCharger is included, box is not. Screen has no cracks. Small mark on the back near the camera. I used it for two years, now I am changing phone.\n\n${pickup(town, 'iPhone 13')} Price is K6,500.`,

  'iPhone 12': (town) =>
    `iPhone 12, 128GB, black. Battery health is about 88%. Face ID and True Tone working. No iCloud lock.\n\nCharger included, no box. Small mark on the aluminium edge. Clean, used by me.\n\n${pickup(town, 'iPhone 12')} Price is K4,500.`,

  'Samsung A54': (town) =>
    `Samsung Galaxy A54 5G, 128GB, 6GB RAM. Used but clean. No cracks on the screen or back. Battery still lasts a full day with normal use.\n\nComes with charger. Dual SIM, I was using Airtel and MTN. Fingerprint and face unlock both work.\n\n${pickup(town, 'Samsung A54')} Not swapping.`,

  'Tecno Spark 20': (town) =>
    `Tecno Spark 20, still new in the box. 128GB, 8GB RAM. Sealed, I bought an extra one and I do not need it.\n\nCharger, earphones and papers are in the box. You can open it here and check IMEI.\n\n${pickup(town, 'Tecno Spark 20')}`,

  'Hisense 32 inch TV': (town) =>
    `Hisense 32 inch digital TV. HDMI and USB working. Picture is clear, sound is fine for a sitting room.\n\nComes with remote and stand. I can help you test DSTV or a decoder if you bring it.\n\n${pickup(town, 'Hisense 32 inch TV')} You carry, or we can talk transport in town.`,

  'HP laptop': (town) =>
    `HP laptop, 8GB RAM, 256GB SSD. Good for school, office and WhatsApp Web. Windows is activated. Charger is there.\n\nKeyboard and screen are fine. Battery gives about 3 hours off the charger. Used, not new, but it is clean and fast enough.\n\n${pickup(town, 'HP laptop')} You can try Word, Excel and YouTube before you pay.`,

  'PlayStation 4': (town) =>
    `PS4 slim with one pad and HDMI cable. Power cable is there. It reads discs and signs into PSN.\n\nI am selling with FIFA and two other games on the disc. Pad has normal wear, analogue still fine.\n\n${pickup(town, 'PlayStation 4')} You can plug it on a TV here and try.`,

  'Bluetooth speaker': (town) =>
    `Portable Bluetooth speaker, new. Charges by USB. Loud enough for a small shop, braai or bedroom.\n\nBattery lasts several hours. Aux cable is in the pack.\n\n${pickup(town, 'Bluetooth speaker')}`,

  'Fridge': (town) =>
    `Medium fridge, used at home. Still cooling well, freezer makes ice. Quiet enough for a house.\n\nYou must come and see it working. I will not refund after you take it. You arrange a van, it will not go in a small car.\n\n${pickup(town, 'Fridge')}`,

  'Microwave': (town) =>
    `Electric microwave, barely used. 20 litre size, turntable inside. Good for reheating nshima leftovers and tea.\n\nComes with the glass plate. I used it a few weeks then we got a bigger one.\n\n${pickup(town, 'Microwave')}`,

  'Generator 2kVA': (town) =>
    `2kVA petrol generator, new, still in the box. Enough for lights, TV, decoder and charging phones during load shedding. Not for a big fridge and kettle at the same time.\n\nYou get the manual and starter. I can start it here so you hear it.\n\n${pickup(town, 'Generator 2kVA')}`,

  'WiFi router': (town) =>
    `Home WiFi router, new. Simple setup with Zamtel, MTN or Airtel fibre or a SIM router line. 4 LAN ports.\n\nBox and cable included.\n\n${pickup(town, 'WiFi router')}`,

  'Tablet': (town) =>
    `Android tablet, 32GB. Used for kids' YouTube and school PDFs. Screen has no cracks. WiFi only, no SIM.\n\nCharger included. I reset it, so it is clean for the next person.\n\n${pickup(town, 'Tablet')}`,

  'Printer': (town) =>
    `Home inkjet printer. Prints and scans. I replaced the black ink last month. USB cable is there, no extra cartridges.\n\nGood for school work and small office papers. Not a heavy duty shop printer.\n\n${pickup(town, 'Printer')}`,

  'Car battery': (town) =>
    `New 12V car battery. Bought for a Corolla then the car sold. Still in the shop pack, not used in a vehicle.\n\nYou can test voltage here. Fits most small Japanese cars. Bring your old one if you want to compare the size.\n\n${pickup(town, 'Car battery')}`,

  'Extension reel': (town) =>
    `20 metre extension reel, new. Thick cable, 4 sockets. Good for a generator, welding or outdoor work.\n\n${pickup(town, 'Extension reel')}`,

  'Toyota Corolla': (town) =>
    `Toyota Corolla 2009, petrol, manual. Engine is sound, it starts and drives. AC is working. Tyres have life left.\n\nWhitebook is there. Mileage is around 168,000 km. Used in town, no accident that I know. Small rust on the boot lip, normal for the year.\n\n${pickup(town, 'Toyota Corolla')} Bring a mechanic if you want. No test drive without talking first.`,

  'Nissan Tiida': (town) =>
    `Nissan Tiida 2008, hatchback, petrol. Easy on fuel for town. Radio and AC working. One owner in Zambia after import.\n\nPapers are in order. Mileage about 142,000 km. Needs nothing urgent, just normal service.\n\n${pickup(town, 'Nissan Tiida')}`,

  'Honda Fit': (town) =>
    `Honda Fit 2009, 1.3 petrol, automatic. Hatchback, not a sports car. Sits 5, boot is useful, very easy on fuel in town.\n\nWhitebook available. Mileage around 102,000 km. AC works, tyres are decent. I used it as a family runaround in Ndola.\n\nAsking K110,000. ${pickup(town, 'Honda Fit')} Serious buyers only, I will not chat in circles.`,

  'Toyota Hilux': (town) =>
    `Toyota Hilux, diesel, used for work around Solwezi. Strong engine, 4x2. Load body is dented from work but the chassis is straight.\n\nWhitebook is there. Mileage about 210,000 km. Good for a small business or farm. Not a show truck.\n\n${pickup(town, 'Toyota Hilux')} Come with a mechanic. Price is K280,000.`,

  'Toyota Vitz': (town) =>
    `Toyota Vitz, petrol, town car. Small, parks anywhere, low fuel. AC and power windows working.\n\nPapers available. Mileage around 155,000 km. Daily driver, no strange noises. A few parking scratches on the bumper.\n\n${pickup(town, 'Toyota Vitz')}`,

  'Mazda Demio': (town) =>
    `Mazda Demio, petrol, small family hatchback. Easy on fuel. Needs a small service (oil and plugs) which I can do before you take it, or you take it as is and knock a bit off.\n\nWhitebook there. Mileage about 161,000 km.\n\n${pickup(town, 'Mazda Demio')}`,

  'Toyota Allion': (town) =>
    `Toyota Allion, petrol, automatic. Comfortable family saloon. AC ice cold. Interior is clean, no torn seats.\n\nPapers in order. Mileage around 149,000 km. Good for Uber or family. I am selling because I am moving to a bigger car.\n\n${pickup(town, 'Toyota Allion')}`,

  'Hiace bus': (town) =>
    `Toyota Hiace, used for passengers on the Chipata road. 14 seater layout. Engine pulls, I have been using it for work.\n\nWhitebook available. Mileage about 245,000 km. Body has work marks, as expected. Good for a small bus business if you service it properly.\n\n${pickup(town, 'Hiace bus')} Inspect with a mechanic.`,

  'Sofa set': (town) =>
    `3 piece sofa set from the house. 5 seater in total (3+1+1). Fabric is still decent, no broken legs. Cushions are used but firm enough.\n\nYou need a van. I will not carry it for you. Come and sit on it before you pay.\n\n${pickup(town, 'Sofa set')}`,

  'Dining table': (town) =>
    `Wooden dining table with 4 chairs. Used at home. Table top has a few heat marks from pots, nothing broken.\n\nChairs are stable. Good for a small family. You pick it up, it will not fit in a hatchback easily.\n\n${pickup(town, 'Dining table')}`,

  'Bed and mattress': (town) =>
    `Double bed with mattress, still new, plastic on the mattress. Wooden frame, slats included.\n\nI ordered two, one is extra. You can lie on it here. Bring a van or I help you find one in town.\n\n${pickup(town, 'Bed and mattress')}`,

  'Wardrobe': (town) =>
    `Wooden 2 door wardrobe, used. Hanging rail and one shelf inside. Doors close properly. A few scratches on the side from moving.\n\nEmpty, ready to go. You dismantle or take it as is, your choice.\n\n${pickup(town, 'Wardrobe')}`,

  'Office chair': (town) =>
    `Office chair, new. Swivel, has wheels, height adjusts. Good for a shop counter or home desk.\n\nStill in the pack from the hardware.\n\n${pickup(town, 'Office chair')}`,

  'Coffee table': (town) =>
    `Small wooden coffee table, used. Lower shelf for remotes. Solid, not chipboard falling apart.\n\nA few cup rings on top. I wiped it, you can varnish if you want.\n\n${pickup(town, 'Coffee table')}`,

  'Kitchen unit': (town) =>
    `Kitchen unit, new, not fitted yet. Sink cut-out is there, taps not included. Two cupboards and a drawer.\n\nI bought it for a mini-flat then the plan changed. You fit it yourself or bring a carpenter.\n\n${pickup(town, 'Kitchen unit')}`,

  'Football jersey': (town) =>
    `Football jersey, new, adult size L. Replica quality, not shop-stolen stock. Print is clean, tags still on.\n\nI have a few clubs. Message me the team you want and I tell you if I have it.\n\n${pickup(town, 'Football jersey')}`,

  'Men sneakers': (town) =>
    `Men's sneakers, new, size 42 (UK 8). Canvas, comfortable for town. I bought the wrong size for my brother.\n\nBox is there. You can try them if your feet are clean.\n\n${pickup(town, 'Men sneakers')}`,

  'Ladies dress': (town) =>
    `Ladies dress, new, African print. Size 12 / 36. Knee length, zip at the back. I stock a few colours.\n\nNot worn, only tried in the shop. Come and fit it.\n\n${pickup(town, 'Ladies dress')}`,

  'School shoes': (town) =>
    `Black school shoes, new, size 5. Leather look, for primary or junior secondary. I bought extras for term one.\n\nYou can check the size against the child's current pair.\n\n${pickup(town, 'School shoes')}`,

  'Winter jacket': (town) =>
    `Winter jacket, used one cold season in Kasama. Size M. Zips work, no tears. Warm enough for June mornings.\n\nWashed. I do not need it in town now.\n\n${pickup(town, 'Winter jacket')}`,

  'Chitenge wraps': (town) =>
    `Chitenge wraps, new, 2 pieces. Strong wax print, good colours. You can use for wrapping, a simple dress, or the house.\n\nI bought a bale, selling per pair. Come and pick the pattern you like.\n\n${pickup(town, 'Chitenge wraps')}`,

  'Work boots': (town) =>
    `Safety work boots, new, size 43. Steel toe, good for site or workshop. I ordered the wrong size for a worker.\n\nBox included. You can try them here.\n\n${pickup(town, 'Work boots')}`,

  'Baby clothes pack': (town) =>
    `Pack of baby clothes, new. 0–6 months. Vests, sleepsuits and two wrappers. I bought for a baby shower and have extras.\n\nNot used, still packed.\n\n${pickup(town, 'Baby clothes pack')}`,

  '50kg maize': (town) =>
    `50kg maize grain, this season, from Eastern Province. Dry, not rotten. Good for pounding or taking to the hammer mill.\n\nYou bring your own empty bags if you want to split. Weighing here if you doubt the bag.\n\n${pickup(town, '50kg maize')} Price is for one 50kg bag.`,

  'Tomatoes crate': (town) =>
    `Crate of tomatoes, fresh from the field this week. Mix of ripe and half ripe so they last a few days.\n\nGood for a small grocery or the house. Come in the morning, they move fast.\n\n${pickup(town, 'Tomatoes crate')}`,

  'Cooking oil 20L': (town) =>
    `20 litre cooking oil, sealed. Shop stock, not diluted. I bought a few for the business, one is extra.\n\nYou can check the seal here. Heavy — bring a car.\n\n${pickup(town, 'Cooking oil 20L')}`,

  'Charcoal bags': (town) =>
    `Small bags of charcoal, well burned, not too much dust. Good for a braai or the brazier.\n\nPrice is per bag. I have more if you need a stack.\n\n${pickup(town, 'Charcoal bags')}`,

  'Plastic chairs x4': (town) =>
    `Four plastic chairs, new, white. Stackable. Good for a shop, church or extra visitors.\n\nI sell the set of 4 together.\n\n${pickup(town, 'Plastic chairs x4')}`,

  'Bicycle': (town) =>
    `Adult bicycle, used, still riding. Gears work, new-ish tyres. I used it to go to town.\n\nSaddle is worn. You can take a short ride outside before you pay. No papers needed, it is just a bike.\n\n${pickup(town, 'Bicycle')}`,

  'Standing fan': (town) =>
    `Standing fan, used at home. 3 speeds, oscillation works. Quiet enough for a bedroom.\n\nCable is fine, plug is the normal 3-pin. I am selling because we put AC.\n\n${pickup(town, 'Standing fan')}`,

  'Clothes iron': (town) =>
    `Dry clothes iron, new. Simple, no steam board needed. Good for uniforms and chitenge.\n\nBox included.\n\n${pickup(town, 'Clothes iron')}`,

  'Baby pram': (town) =>
    `Baby pram, used for one child. Folds, wheels are fine, sunshade is there. Cleaned.\n\nSafety belt works. Come and fold it yourself so you see it is not stuck.\n\n${pickup(town, 'Baby pram')}`,

  'Baby crib': (town) =>
    `Wooden baby crib, used. Dropside works. Mattress is included, I washed the cover.\n\nNo broken bars. Good until the child starts climbing out.\n\n${pickup(town, 'Baby crib')}`,

  'Gas stove': (town) =>
    `2 burner gas stove, used in the kitchen. Connects to a normal 9kg or 45kg with a hose (hose not included).\n\nBurners light evenly. I moved to electric. You can test with your own cylinder.\n\n${pickup(town, 'Gas stove')}`,

  'Water pump': (town) =>
    `Electric water pump, new. For a borehole or moving water to a tank. I bought the wrong size for my plot.\n\nStill boxed. You confirm the horsepower with your plumber before you come, so we do not waste a trip.\n\n${pickup(town, 'Water pump')}`,
};

const EXTRA_COPY = {
  'Itel A18': (town, name) => {
    const colour = phoneColour(name, town);
    return `Itel A18, used, ${colour}. Dual SIM, 32GB. Still making calls and WhatsApp with no problem. Battery is about ${batteryPct(name, town)}% health — lasts the day if you are not on TikTok all the time.\n\nCharger included. Screen has light scratches, no cracks. Good cheap phone for a child or as a backup.\n\n${pickup(town, name)}`;
  },
  'Tecno Pop 8': (town, name) =>
    `Tecno Pop 8, used daily, ${phoneColour(name, town)}. 64GB. Fingerprint works. Battery about ${batteryPct(name, town)}%. I am upgrading to a Spark.\n\nCharger is there. Small knock on the corner, screen is fine.\n\n${pickup(town, name)}`,
  'Tecno Spark 10': (town, name) =>
    `Tecno Spark 10, 128GB. No cracks. Camera is decent for the price. Battery around ${batteryPct(name, town)}%. Dual SIM, Airtel and MTN both registered before, I will deregister when you take it.\n\nCharger included, no box.\n\n${pickup(town, name)}`,
  'Infinix Hot 12': (town, name) =>
    `Infinix Hot 12, strong battery — I still get a full day. 64GB, ${phoneColour(name, town)}. Used, not new. Charging port is tight, no loose cable.\n\nComes with charger. I reset it this morning.\n\n${pickup(town, name)}`,
  'Samsung A14': (town, name) =>
    `Samsung A14, 64GB, used and clean. Samsung keyboard, Play Store, all working. Battery about ${batteryPct(name, town)}%.\n\nNo cracks. Charger included. Good if you want Samsung without paying A54 money.\n\n${pickup(town, name)}`,
  'iPhone 11': (town, name) =>
    `iPhone 11, 64GB. Face ID working. Battery health about ${batteryPct(name, town)}%. No iCloud lock.\n\nBack glass is fine, screen has no cracks. Charger in the pack, no original box. You can test iMessage and camera here.\n\n${pickup(town, name)}`,
  'iPhone 12': (town, name) =>
    `iPhone 12, 128GB. Battery about ${batteryPct(name, town)}%. Face ID and True Tone working. Clean, used by me, not a shop refurb story.\n\nSmall mark on the aluminium edge. Charger included.\n\n${pickup(town, name)} Price is for a quick sale.`,
  'Samsung A04': (town, name) =>
    `Samsung A04, still new, used less than two weeks. 32GB. I bought it for my mother and she preferred a bigger screen.\n\nBox, charger and earphones are there. You can check the shop receipt date.\n\n${pickup(town, name)}`,
  'Hisense 32 inch TV': (town, name) =>
    `Hisense 32 inch, used at home for about a year. HDMI works, USB plays a flash. Remote is original.\n\nStand is there. One dead pixel on the far left, you only see it on a white screen. Picture is otherwise fine.\n\n${pickup(town, name)}`,
  'Skyworth 43 inch TV': (town, name) =>
    `Skyworth 43 inch, used. Good sitting-room size. Ports working. I am moving house and I want a smaller TV.\n\nRemote included. You need two people to lift it. I can switch it on so you see the picture.\n\n${pickup(town, name)}`,
  'Dell laptop': (town, name) =>
    `Dell laptop, 8GB RAM, 256GB. For school: Zoom, Word, research. Charger included. Battery about 2–3 hours.\n\nA few keyboard shine marks. I installed a fresh Windows. You can try it on the table here.\n\n${pickup(town, name)}`,
  'DSTV decoder': (town, name) =>
    `DSTV decoder, used, with remote and power pack. I swapped to GOtv. You put your own smartcard / account.\n\nI will not sort your subscription. Machine itself is fine, I was watching last week.\n\n${pickup(town, name)}`,
  'Tiger 1kVA generator': (town, name) =>
    `Tiger 1kVA petrol generator, new. For lights, decoder and charging. Not for a fridge and iron together.\n\nI can start it so you hear it. Fuel tank is empty for transport — you put petrol.\n\n${pickup(town, name)}`,
  'Kettle': (town, name) =>
    `Electric kettle, new, 1.7L. Boils fast. Auto cut-off working on the shop floor sample, this one is boxed.\n\n${pickup(town, name)}`,
  'Toyota Vitz 2010': (town, name) => {
    const km = 148000 + townIndex(town) * 2800;
    return `Toyota Vitz 2010, petrol, town car. Mileage about ${km.toLocaleString('en-US')} km. AC working, low fuel use.\n\nWhitebook available. A few scratches on the rear bumper from parking. Engine is sound, I service it at a local garage.\n\n${pickup(town, name)} Bring a mechanic if you want.`;
  },
  'Mazda Demio 2012': (town, name) => {
    const km = 132000 + townIndex(town) * 3100;
    return `Mazda Demio 2012, petrol, hatchback. Mileage around ${km.toLocaleString('en-US')} km. Easy on fuel, good for a first car.\n\nPapers in order. Radio works. Needs nothing major, just keep up the service.\n\n${pickup(town, name)}`;
  },
  'Toyota Corolla 2008': (town, name) => {
    const km = 175000 + townIndex(town) * 2500;
    return `Toyota Corolla 2008, petrol, manual. Mileage about ${km.toLocaleString('en-US')} km. Strong for the year. AC blows cold.\n\nWhitebook there. Town use, not a bush car. Tyres 60%.\n\n${pickup(town, name)}`;
  },
  'Toyota Premio': (town, name) => {
    const km = 158000 + townIndex(town) * 2700;
    return `Toyota Premio, petrol, automatic. Family saloon. Mileage around ${km.toLocaleString('en-US')} km. Interior clean, AC fine.\n\nPapers available. Comfortable for Chipata–Lusaka trips if you service it.\n\n${pickup(town, name)}`;
  },
  'Toyota Noah': (town, name) => {
    const km = 168000 + townIndex(town) * 2200;
    return `Toyota Noah, petrol, 7–8 seater family van. Mileage about ${km.toLocaleString('en-US')} km. Sliding doors work. Good for school runs and church.\n\nWhitebook there. Used by a family, not a taxi. A few interior marks from kids.\n\n${pickup(town, name)}`;
  },
  'Sofa 3 piece': (town, name) =>
    `3 piece sofa (3+1+1), used in a sitting room. Fabric still decent, one small stain on the arm that I treated.\n\nCushions included. You bring a van. Sit on it before you pay so you are happy.\n\n${pickup(town, name)}`,
  'Double bed': (town, name) =>
    `Double bed frame and mattress, used. Mattress still firm, I flipped it last month. Slats are complete.\n\nNo bedbugs — I treated the room. Come and see in daylight.\n\n${pickup(town, name)}`,
  'Wardrobe 2 door': (town, name) =>
    `2 door wardrobe, used. Hanging space and a shelf. Doors align. A scratch on the left door from a move.\n\nEmpty. You can take the shelves out to carry it down stairs.\n\n${pickup(town, name)}`,
  'Dining 4 chairs': (town, name) =>
    `Dining table with 4 chairs, used. Wood, not plastic. Table is 4-seater size. One chair has a tighter joint than the others but it does not wobble badly.\n\n${pickup(town, name)} Bring a van or a pick-up.`,
  'Football jersey': (town, name) =>
    `Football jersey, new, size L. Print not cracked. I sell a few teams — ask which one you want before you travel.\n\n${pickup(town, name)}`,
  'Ladies chitenge dress': (town, name) =>
    `Ladies chitenge dress, new, size 14. Fitted waist, zip at the back. Made here, not a supermarket reject.\n\nCome and fit. I can take 2 cm on the hem if you are shorter, for a small extra.\n\n${pickup(town, name)}`,
  'Canvas sneakers': (town, name) =>
    `Canvas sneakers, new, size 41. Unisex look. I bought a pair too small.\n\nBox there. Try them here.\n\n${pickup(town, name)}`,
  'School shoes size 4': (town, name) =>
    `Black school shoes, new, size 4. For a younger child. I got size 5 as well in another ad if this is small.\n\n${pickup(town, name)}`,
  'Breakfast mealie meal 25kg': (town, name) =>
    `Breakfast mealie meal, 25kg, this month's stock. Fine grind, not roller. Bag is sealed.\n\nPrice is per bag. I can do a small discount if you take 3 or more.\n\n${pickup(town, name)}`,
  'Roller mealie meal 25kg': (town, name) =>
    `Roller mealie meal, 25kg, sealed bag. Coarser than breakfast, good for nshima. This season mill.\n\nYou can check the date stamp on the bag.\n\n${pickup(town, name)}`,
};

const CAR_SPECS = {
  'Toyota Corolla': { make: 'Toyota', model: 'Corolla', year: 2009, mileage: 168000 },
  'Nissan Tiida': { make: 'Nissan', model: 'Tiida', year: 2008, mileage: 142000 },
  'Honda Fit': { make: 'Honda', model: 'Fit', year: 2009, mileage: 102000 },
  'Toyota Hilux': { make: 'Toyota', model: 'Hilux', year: 2012, mileage: 210000 },
  'Toyota Vitz': { make: 'Toyota', model: 'Vitz', year: 2011, mileage: 155000 },
  'Mazda Demio': { make: 'Mazda', model: 'Demio', year: 2011, mileage: 161000 },
  'Toyota Allion': { make: 'Toyota', model: 'Allion', year: 2010, mileage: 149000 },
  'Hiace bus': { make: 'Toyota', model: 'Hiace', year: 2007, mileage: 245000 },
  'Toyota Vitz 2010': { make: 'Toyota', model: 'Vitz', year: 2010, mileage: 148000 },
  'Mazda Demio 2012': { make: 'Mazda', model: 'Demio', year: 2012, mileage: 132000 },
  'Toyota Corolla 2008': { make: 'Toyota', model: 'Corolla', year: 2008, mileage: 175000 },
  'Toyota Premio': { make: 'Toyota', model: 'Premio', year: 2011, mileage: 158000 },
  'Toyota Noah': { make: 'Toyota', model: 'Noah', year: 2013, mileage: 168000 },
};

function itemName(title) {
  return String(title || '').replace(/ — .+$/, '');
}

function describeListing(title, town) {
  const name = itemName(title);
  if (BASE_COPY[title]) return BASE_COPY[title](town);
  if (EXTRA_COPY[name]) return EXTRA_COPY[name](town, name);
  return `${name}. Selling in ${town}. Come and see it before you pay. Cash on pickup.`;
}

function locationLabel(title, town) {
  return `${areaFor(town, itemName(title))}, ${town}`;
}

function carSpecsFor(title, town) {
  const name = itemName(title);
  const base = CAR_SPECS[name] || CAR_SPECS[title];
  if (!base) return null;
  const extraBump = / — /.test(title) ? townIndex(town) * 2800 : 0;
  return {
    make: base.make,
    model: base.model,
    year: base.year,
    mileage: base.mileage + extraBump,
  };
}

module.exports = { describeListing, locationLabel, carSpecsFor, areaFor };
