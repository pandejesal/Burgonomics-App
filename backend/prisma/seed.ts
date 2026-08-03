import { PrismaClient, StoreStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const STORES_DATA = [
  {
    name: 'Burgonomics Navrangpura',
    address: 'Shop no.2 Nilamber Complex, H.L. College Road, Navrangpura Ahmedabad Gujarat 380009',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380009',
    phone: '07878182109',
    latitude: 23.034362,
    longitude: 72.5548094,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_navrangpura',
  },
  {
    name: 'Burgonomics Nehrunagar',
    address: '54/1 H Colony, Opp L Colony, Surendra Mangaldas Road, Ambawadi Ahmedabad 380015',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380015',
    phone: null,
    latitude: 23.0238553,
    longitude: 72.5431102,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_nehrunagar',
  },
  {
    name: 'Burgonomics Mansi Circle',
    address: 'GF-7 Saaman Complex, Near Mansi Circle, Satellite Ahmedabad 380015',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380015',
    phone: null,
    latitude: 23.030118,
    longitude: 72.5270369,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_mansi_circle',
  },
  {
    name: 'Burgonomics Science City',
    address: 'GF-8 City Square, Science City Road, Hebatpur Ahmedabad 380060',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380060',
    phone: null,
    latitude: 23.0812512,
    longitude: 72.4986892,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_science_city',
  },
  {
    name: 'Burgonomics Gota',
    address: 'Ganesh Glory, Gota Ahmedabad 382470',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '382470',
    phone: '09327681032',
    latitude: 23.1142466,
    longitude: 72.5402784,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_gota',
  },
  {
    name: 'Burgonomics Nikol',
    address: 'Golden Plaza Near Amar Jawan Circle Nikol Ahmedabad 380049',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380049',
    phone: '08160869600',
    latitude: 23.0395227,
    longitude: 72.6754691,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_nikol',
  },
  {
    name: 'Burgonomics Motera',
    address: 'Shop 7 Aditya Avenue Ashok Vihar Circle Chandkheda Ahmedabad 380005',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380005',
    phone: '07985019630',
    latitude: 23.1072435,
    longitude: 72.6007134,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_motera',
  },
  {
    name: 'Burgonomics SOBO',
    address: 'Shop 13 Praharsh Highland South Bopal Ahmedabad 380058',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380058',
    phone: null,
    latitude: 23.0169362,
    longitude: 72.4629984,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_sobo',
  },
  {
    name: 'Burgonomics Nizampura',
    address: 'C261 Guru Gobindsinhji Marg Opp Maruti Complex Vadodara 390024',
    city: 'Vadodara',
    state: 'Gujarat',
    pincode: '390024',
    phone: '09426436699',
    latitude: 22.3388749,
    longitude: 73.178614,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_nizampura',
  },
  {
    name: 'Burgonomics Akshar Chowk',
    address: 'Ground Floor Abhishek Complex Old Padra Road Vadodara 390007',
    city: 'Vadodara',
    state: 'Gujarat',
    pincode: '390007',
    phone: null,
    latitude: 22.2829475,
    longitude: 73.1647262,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_akshar_chowk',
  },
  {
    name: 'Burgonomics Containers Park',
    address: 'Shop 13 The Containers Park Gotri Sevasi Road Vadodara 390021',
    city: 'Vadodara',
    state: 'Gujarat',
    pincode: '390021',
    phone: '07405184152',
    latitude: 22.317958,
    longitude: 73.1280658,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_containers_park',
  },
  {
    name: 'Burgonomics Pal Road',
    address: 'Samarth House Canal Road Near Pal Adajan Surat 395009',
    city: 'Surat',
    state: 'Gujarat',
    pincode: '395009',
    phone: null,
    latitude: 21.1946076,
    longitude: 72.7796668,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_pal_road',
  },
  {
    name: 'Burgonomics Raiya Road',
    address: 'West Gate 150 Feet Ring Road Rajkot 360007',
    city: 'Rajkot',
    state: 'Gujarat',
    pincode: '360007',
    phone: null,
    latitude: 22.2985409,
    longitude: 70.7692436,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_raiya_road',
  },
  {
    name: 'Burgonomics Food Valley',
    address: 'Container 42C Food Valley Gomti River Gomti Nagar Lucknow 226010',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    pincode: '226010',
    phone: null,
    latitude: 26.852991,
    longitude: 80.9723396,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_food_valley',
  },
  {
    name: 'Burgonomics Kota',
    address: 'District Centre A47 Talwandi Kota Rajasthan 324005',
    city: 'Kota',
    state: 'Rajasthan',
    pincode: '324005',
    phone: '07878259596',
    latitude: 25.1534831,
    longitude: 75.8382409,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_kota',
  },
  {
    name: 'Burgonomics Ayodhya',
    address: 'Sabri Food Plaza Civil Line Ayodhya 224001',
    city: 'Ayodhya',
    state: 'Uttar Pradesh',
    pincode: '224001',
    phone: '08957474149',
    latitude: 26.7761531,
    longitude: 82.1353608,
    status: StoreStatus.OPEN,
    petpoojaRestId: 'rest_ayodhya',
  },
];

async function main(): Promise<void> {
  // Upsert the beta feature flag
  await prisma.featureFlag.upsert({
    where: { key: 'BETA' },
    update: {},
    create: { key: 'BETA', enabled: false, description: 'Beta features gate' },
  });

  console.log('Seeding stores (idempotent upsert)...');

  for (const storeData of STORES_DATA) {
    const store = await prisma.store.upsert({
      where: { petpoojaRestId: storeData.petpoojaRestId },
      update: {
        name: storeData.name,
        address: storeData.address,
        city: storeData.city,
        state: storeData.state,
        pincode: storeData.pincode,
        phone: storeData.phone,
        latitude: storeData.latitude,
        longitude: storeData.longitude,
        status: storeData.status,
      },
      create: {
        name: storeData.name,
        address: storeData.address,
        city: storeData.city,
        state: storeData.state,
        pincode: storeData.pincode,
        phone: storeData.phone,
        latitude: storeData.latitude,
        longitude: storeData.longitude,
        status: storeData.status,
        minPrepMinutes: 15,
        petpoojaRestId: storeData.petpoojaRestId,
      },
    });

    // Seed operating hours for every day of the week (0 = Sunday to 6 = Saturday)
    // Clear hours for this specific store first to avoid duplicates
    await prisma.storeHours.deleteMany({ where: { storeId: store.id } });

    for (let day = 0; day <= 6; day++) {
      await prisma.storeHours.create({
        data: {
          storeId: store.id,
          dayOfWeek: day,
          openTime: '10:00',
          closeTime: '23:00',
        },
      });
    }
  }

  console.log(`Successfully seeded ${STORES_DATA.length} stores.`);

  console.log('Seeding admin permissions...');
  const permissionsData = [
    { key: 'admin.dashboard.view', description: 'View admin dashboard analytics and overview' },
    { key: 'admin.orders.view', description: 'View active and historical customer orders' },
    { key: 'admin.orders.cancel', description: 'Cancel active customer orders' },
    { key: 'admin.orders.edit', description: 'Modify orders or update statuses' },
    { key: 'admin.stores.view', description: 'View store profiles and operating hours' },
    { key: 'admin.stores.edit', description: 'Modify store settings, hours, or toggle statuses' },
    { key: 'admin.menu.sync', description: 'Trigger manual synchronization of menus' },
    { key: 'admin.menu.edit', description: 'Edit products, prices, and custom configurations' },
    {
      key: 'admin.petpooja.view',
      description: 'View Petpooja integration configurations and status',
    },
    { key: 'admin.petpooja.sync', description: 'Sync catalog or configuration with Petpooja' },
    { key: 'admin.queue.view', description: 'View queue tasks and background jobs' },
    { key: 'admin.queue.pause', description: 'Pause processing of background queue lines' },
    { key: 'admin.queue.retry', description: 'Retry failed queue jobs' },
    { key: 'admin.customer.view', description: 'View customer accounts and profiles' },
    { key: 'admin.customer.edit', description: 'Edit customer information or freeze accounts' },
    { key: 'admin.payment.view', description: 'View transactional lists and payment details' },
    { key: 'admin.payment.refund', description: 'Initiate order or transaction refunds' },
    {
      key: 'admin.notification.send',
      description: 'Send push or target promotional notifications',
    },
    {
      key: 'admin.analytics.view',
      description: 'Access granular financial and operational performance logs',
    },
    { key: 'admin.settings.edit', description: 'Modify generic administrative configs' },
    { key: 'admin.developer', description: 'Root developer systems and diagnostic logs access' },
  ];

  const dbPermissions: Record<string, any> = {};
  for (const perm of permissionsData) {
    const dbPerm = await prisma.adminPermission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: { key: perm.key, description: perm.description },
    });
    dbPermissions[perm.key] = dbPerm;
  }

  console.log('Seeding admin roles...');
  const rolesData = [
    {
      name: 'Developer',
      description: 'Root system developer with absolute permissions',
      isSystemRole: true,
    },
    {
      name: 'Super Admin',
      description: 'Highest operational administrative access',
      isSystemRole: true,
    },
    {
      name: 'Operations',
      description: 'Manage orders, stores, queue lines, and menu parameters',
      isSystemRole: false,
    },
    {
      name: 'Store Manager',
      description: 'Manage physical store configurations, timings, and orders',
      isSystemRole: false,
    },
    {
      name: 'Finance',
      description: 'View payments, run manual refunds, view performance sheets',
      isSystemRole: false,
    },
    {
      name: 'Support',
      description: 'Interact with customer accounts, cancel or edit orders, check queue issues',
      isSystemRole: false,
    },
    {
      name: 'Marketing',
      description: 'Broadcast target notifications and check campaigns tracking',
      isSystemRole: false,
    },
  ];

  const dbRoles: Record<string, any> = {};
  for (const role of rolesData) {
    const dbRole = await prisma.adminRole.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystemRole: role.isSystemRole },
      create: { name: role.name, description: role.description, isSystemRole: role.isSystemRole },
    });
    dbRoles[role.name] = dbRole;
  }

  console.log('Mapping role permissions...');
  // Clear existing mappings to avoid duplicate constraints
  await prisma.adminRolePermission.deleteMany({});

  const roleMappings: Record<string, string[]> = {
    Developer: permissionsData.map((p) => p.key),
    'Super Admin': permissionsData.filter((p) => p.key !== 'admin.developer').map((p) => p.key),
    Operations: [
      'admin.dashboard.view',
      'admin.orders.view',
      'admin.orders.cancel',
      'admin.orders.edit',
      'admin.stores.view',
      'admin.stores.edit',
      'admin.menu.sync',
      'admin.menu.edit',
      'admin.queue.view',
      'admin.queue.pause',
      'admin.queue.retry',
    ],
    'Store Manager': [
      'admin.dashboard.view',
      'admin.orders.view',
      'admin.orders.edit',
      'admin.stores.view',
      'admin.stores.edit',
      'admin.menu.sync',
    ],
    Finance: [
      'admin.dashboard.view',
      'admin.payment.view',
      'admin.payment.refund',
      'admin.analytics.view',
    ],
    Support: [
      'admin.orders.view',
      'admin.orders.cancel',
      'admin.orders.edit',
      'admin.customer.view',
      'admin.queue.view',
    ],
    Marketing: ['admin.dashboard.view', 'admin.notification.send', 'admin.analytics.view'],
  };

  for (const [roleName, permKeys] of Object.entries(roleMappings)) {
    const roleId = dbRoles[roleName].id;
    for (const key of permKeys) {
      const permissionId = dbPermissions[key].id;
      await prisma.adminRolePermission.create({
        data: {
          roleId,
          permissionId,
        },
      });
    }
  }

  console.log('Seeding developer account...');
  const devEmail = process.env.ADMIN_DEVELOPER_EMAIL || 'dev@burgonomics.com';
  const devPassword = process.env.ADMIN_DEVELOPER_PASSWORD || 'BurgonomicsDev2026!';
  const hashedPassword = await argon2.hash(devPassword);

  const existingDev = await prisma.adminUser.findUnique({
    where: { email: devEmail },
  });

  if (existingDev) {
    await prisma.adminUser.update({
      where: { id: existingDev.id },
      data: {
        passwordHash: hashedPassword,
        fullName: 'System Developer',
        roleId: dbRoles['Developer'].id,
        isActive: true,
      },
    });
  } else {
    await prisma.adminUser.create({
      data: {
        email: devEmail,
        passwordHash: hashedPassword,
        fullName: 'System Developer',
        roleId: dbRoles['Developer'].id,
        isActive: true,
        isDeveloper: true,
      },
    });
  }

  console.log('Seeding glassdoors admin account...');
  const glassdoorsEmail = 'glassdoors.studio@gmail.com';
  const glassdoorsPassword = 'glassdoors@2008';
  const hashedGlassdoorsPassword = await argon2.hash(glassdoorsPassword);

  const existingGlassdoors = await prisma.adminUser.findUnique({
    where: { email: glassdoorsEmail },
  });

  if (existingGlassdoors) {
    await prisma.adminUser.update({
      where: { id: existingGlassdoors.id },
      data: {
        passwordHash: hashedGlassdoorsPassword,
        fullName: 'Glassdoors Studio Admin',
        roleId: dbRoles['Developer'].id,
        isActive: true,
      },
    });
  } else {
    await prisma.adminUser.create({
      data: {
        email: glassdoorsEmail,
        passwordHash: hashedGlassdoorsPassword,
        fullName: 'Glassdoors Studio Admin',
        roleId: dbRoles['Developer'].id,
        isActive: true,
        isDeveloper: true,
      },
    });
  }

  console.log('All admin resources successfully seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
