
const prisma = require('../db');

async function getPartnerByName(name, version = null) {
  try {
    const partner = await prisma.partner.findFirst({
      where: { name, is_active: true },
      include: {
        configs: {
          ...(version
            ? { where: { version } }                         
            : { orderBy: { version: 'desc' }, take: 1 }),    
        },
        categories: true,
        screens: {
          include: {
            fields: true,  
          },
        },
      }
    });

    if (partner) {
      const config = partner.configs[0] || null;
      const screenIdsOrder = config?.screen_ids || [];

      
      let screens = partner.screens.length ? partner.screens : [{
        name: "Screen 1",
        backgroundColor: "",
        heading: "",
        continueButtonText: "Continue",
        fields: [],
        is_active: true,
        screen_config: {},
      }];

      
      screens = screens
        .filter(screen => screenIdsOrder.includes(screen.id))  
        .sort((a, b) => screenIdsOrder.indexOf(a.id) - screenIdsOrder.indexOf(b.id)); 

      return {
        id: partner.id,
        name: partner.name,
        logo: partner.logo,
        isActive: partner.isActive,
        createdAt: partner.created_at,
        updatedAt: partner.updated_at,
        config: config ? {
          id: config.id,
          version: config.version,
          global_config: config.global_config,
          header_config: config.header_config,
          footer_config: config.footer_config,
          layout_config: config.layout_config,
          screen_ids: config.screen_ids,
          created_at: config.created_at,
          updated_at: config.updated_at
        } : null,
        screens: screens.map(screen => ({
          ...screen,
          fields: screen.fields || [],  
        })),
        categories: partner.categories,
      };
    }

    return null;
  } catch (err) {
    console.error(err);
    throw new Error("Failed to retrieve partner data");
  }
}

async function updateCategoryStatus(partnerId, categoryName, isActive)  {
  try {
    return await prisma.category.updateMany({
      where: {
        partner_id: partnerId,
        name: categoryName,
      },
      data: {
        is_active: isActive,
      },
    });
  } catch (error) {
    console.error("Error updating category status:", error);
    throw error;
  }
};
  
async function updateOrCreatePartnerConfig(partnerId, configId, updates, createNewVersion) {
  const underscoreUpdates = updates;

  if (createNewVersion) {
    const latestConfig = await prisma.partnerConfig.findFirst({
      where: { partner_id: partnerId },
      orderBy: { version: 'desc' },
    });

    if (!latestConfig) throw new Error("No existing configuration found for this partner");

    const newVersionNumber = latestConfig.version + 1;
    const existingScreens = await prisma.screen.findMany({
      where: {
        id: { in: latestConfig.screen_ids },
        configuration_version: latestConfig.version,
      },
      include: { fields: true },
    });

    const newScreenIds = [];

    for (const screen of existingScreens) {
      const { screen_config, fields, category_name } = screen;

      
      const newScreen = await prisma.screen.create({
        data: {
          partner_id: partnerId,
          category_name: category_name,
          screen_config: screen_config,
          is_active: screen.is_active,
          configuration_version: newVersionNumber,
        },
      });
      const newScreenId = newScreen.id;
      newScreenIds.push(newScreenId);

      const newFieldIds = [];

      
      for (const field of fields) {
        const newField = await prisma.field.create({
          data: {
            screen_id: newScreenId, 
            type: field.type,
            field_config: field.field_config,
            is_active: field.is_active,
            configuration_version: newVersionNumber,
          },
        });
        newFieldIds.push(newField.id);
      }

      
      await prisma.screen.update({
        where: { id: newScreenId },
        data: {
          field_ids: newFieldIds,
        },
      });
    }

    
    return await prisma.partnerConfig.create({
      data: {
        partner_id: partnerId,
        version: newVersionNumber,
        global_config: underscoreUpdates.global_config || latestConfig.global_config,
        header_config: underscoreUpdates.header_config || latestConfig.header_config,
        footer_config: underscoreUpdates.footer_config || latestConfig.footer_config,
        layout_config: underscoreUpdates.layout_config || latestConfig.layout_config,
        screen_ids: newScreenIds,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  } else {
    const existingConfig = await prisma.partnerConfig.findUnique({
      where: { id: configId },
    });

    if (!existingConfig) throw new Error("Configuration not found");

    return await prisma.partnerConfig.update({
      where: { id: configId },
      data: {
        global_config: underscoreUpdates.global_config ?? existingConfig.global_config,
        header_config: underscoreUpdates.header_config ?? existingConfig.header_config,
        footer_config: underscoreUpdates.footer_config ?? existingConfig.footer_config,
        layout_config: underscoreUpdates.layout_config ?? existingConfig.layout_config,
        updated_at: new Date(),
      },
    });
  }
}



async function deletePartner(id) {
  return await prisma.partner.delete({
    where: { id },
  });
}

async function getScreens(partnerId) {
  return await prisma.screen.findMany({
    where: { partner_id: partnerId, is_active: true },
    include: { fields: true },
  });
}


async function saveScreens(partnerId, configurationVersionString, categoryName, screens) {
  const configurationVersion = parseInt(configurationVersionString, 10);

  
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
  });

  if (!partner) {
    throw new Error(`Partner with id ${partnerId} does not exist.`);
  }

  const partnerConfig = await prisma.partnerConfig.findFirst({
    where: {
      partner_id: partnerId,
      version: configurationVersion,
    },
  });

  if (!partnerConfig) {
    throw new Error(
      `PartnerConfig for partner ${partnerId} and version ${configurationVersion} not found.`
    );
  }

  
  return await prisma.$transaction(async (prisma) => {
    const screenIds = []; 

    
    const existingScreens = await prisma.screen.findMany({
      where: {
        partner_id: partnerId,
        category_name: categoryName,
        configuration_version: configurationVersion,
      },
      select: { id: true },
    });
    const existingScreenIds = existingScreens.map((screen) => screen.id);

    for (let i = 0; i < screens.length; i++) {
      const screen = screens[i];
      const { id, screen_config, fields } = screen;

      let screenId;

      if (id) {
        
        await prisma.screen.update({
          where: { id, configuration_version: configurationVersion },
          data: {
            screen_config: screen_config || {},
            is_active: true,
            configuration_version: configurationVersion,
          },
        });
        screenId = id;
        screenIds.push(screenId);
      } else {
        
        const createdScreen = await prisma.screen.create({
          data: {
            partner_id: partnerId,
            category_name: categoryName,
            screen_config: screen_config || {},
            is_active: true,
            configuration_version: configurationVersion,
          },
        });
        screenId = createdScreen.id;
        screenIds.push(screenId);
      }

      
      const inputFields = fields || [];

      
      const existingFields = await prisma.field.findMany({
        where: {
          screen_id: screenId,
          configuration_version: configurationVersion,
        },
        select: { id: true },
      });
      const existingFieldIds = existingFields.map((field) => field.id);

      const fieldIds = []; 

      for (let j = 0; j < inputFields.length; j++) {
        const field = inputFields[j];
        const { id: fieldId, type, field_config } = field;
        const { attributes, rules } = field_config || {};

        if (fieldId) {
          
          await prisma.field.update({
            where: { id: fieldId, configuration_version: configurationVersion },
            data: {
              type: type || undefined,
              field_config: {
                attributes: attributes || {},
                rules: rules || {},
              },
              is_active: true,
            },
          });
          fieldIds.push(fieldId);
        } else {
          
          const createdField = await prisma.field.create({
            data: {
              screen_id: screenId,
              type: type,
              field_config: {
                attributes: attributes || {},
                rules: rules || {},
              },
              is_active: true,
              configuration_version: configurationVersion,
            },
          });
          fieldIds.push(createdField.id);
        }
      }

      
      const fieldsToDelete = existingFieldIds.filter((id) => !fieldIds.includes(id));
      if (fieldsToDelete.length > 0) {
        await prisma.field.deleteMany({
          where: {
            id: { in: fieldsToDelete },
            configuration_version: configurationVersion,
          },
        });
      }

      
      await prisma.screen.update({
        where: { id: screenId, configuration_version: configurationVersion },
        data: { field_ids: fieldIds },
      });
    }

    
    const screensToDelete = existingScreenIds.filter((id) => !screenIds.includes(id));
    if (screensToDelete.length > 0) {
      
      await prisma.field.deleteMany({
        where: {
          screen_id: { in: screensToDelete },
          configuration_version: configurationVersion,
        },
      });

      await prisma.screen.deleteMany({
        where: {
          id: { in: screensToDelete },
          configuration_version: configurationVersion,
        },
      });
    }

    
    await prisma.partnerConfig.update({
      where: {
        id: partnerConfig.id,
      },
      data: {
        screen_ids: screenIds,
      },
    });

    
    const updatedScreensList = await prisma.screen.findMany({
      where: {
        id: { in: screenIds },
        configuration_version: configurationVersion,
      },
      include: { fields: true },
    });

    
    const orderedScreens = screenIds.map((id) =>
      updatedScreensList.find((screen) => screen.id === id)
    );

    return {
      screens: orderedScreens,
      screen_ids: screenIds,
    };
  });
}


async function deleteScreen(screenId) {
  return await prisma.screen.update({
    where: { id: screenId },
    data: { is_active: false },
  });
}

 async function getPartnerConfigurations (partnerName) {
    
    const partner = await prisma.partner.findUnique({
      where: { name: partnerName },
      select: { id: true },
    });

    if (!partner) {
      throw new Error(`Partner with name ${partnerName} not found`);
    }

    
    const configurations = await prisma.partnerConfig.findMany({
      where: { partner_id: partner.id },
      orderBy: { version: 'desc' },
      take: 10,
      select: {
        version: true,
        created_at: true,
        
      },
    });

    return configurations;
  }

  async function validatePincode(pincode) {
     return pincode.startsWith("1000");
  }


module.exports = {
  getPartnerByName,
  updateOrCreatePartnerConfig,
  deletePartner,
  updateCategoryStatus,
  getScreens,
  saveScreens,
  deleteScreen,
  getPartnerConfigurations,
  validatePincode,
};