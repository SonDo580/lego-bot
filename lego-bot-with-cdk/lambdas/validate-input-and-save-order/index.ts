import { LexV2Event, LexV2Slots, LexV2Result } from "aws-lambda";
import {
  DynamoDBClient,
  PutItemCommand,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";

const dynamodbClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

const LEGO_SIZES = ["small", "medium", "large"];
const LEGO_MODELS = ["ship", "tank", "rocket"];

enum SlotName {
  LegoSize = "LegoSize",
  LegoModel = "LegoModel",
}

type ValidationResult = {
  isValid: boolean;
  invalidSlotName?: string;
  message?: string;
};

type DynamoDBItem = Record<string, AttributeValue>;

export const handler = async (event: LexV2Event): Promise<LexV2Result> => {
  console.log(`Received event: ${event}`);

  const { invocationSource } = event;
  const { name: intentName, slots } = event.sessionState.intent;

  if (invocationSource == "DialogCodeHook") {
    const orderValidationResult = validateOrder(slots);

    if (!orderValidationResult.isValid) {
      const { invalidSlotName, message } = orderValidationResult;
      return buildElicitSlotResponse(
        intentName,
        slots,
        invalidSlotName as string,
        message
      );
    } else {
      return buildDelegateResponse(intentName, slots);
    }
  }

  if (invocationSource == "FulfillmentCodeHook") {
    await saveOrder(slots);

    return buildFulfillmentResponse(
      intentName,
      slots,
      "I've placed your order"
    );
  }

  throw new Error(`Unexpected invocationSource: ${invocationSource}`);
};

function validateOrder(slots: LexV2Slots): ValidationResult {
  const legoSize = extractSlotValue(slots, SlotName.LegoSize);
  if (!legoSize) {
    return {
      isValid: false,
      invalidSlotName: SlotName.LegoSize,
      message: `Which ${SlotName.LegoSize} do you want (${LEGO_SIZES.join(
        ", "
      )})?`,
    };
  }
  if (!LEGO_SIZES.includes(legoSize)) {
    return {
      isValid: false,
      invalidSlotName: SlotName.LegoSize,
      message: `Please select ${LEGO_SIZES.join(", ")}`,
    };
  }

  const legoModel = extractSlotValue(slots, SlotName.LegoModel);
  if (!legoModel) {
    return {
      isValid: false,
      invalidSlotName: SlotName.LegoModel,
      message: `Which ${SlotName.LegoModel} do you want (${LEGO_MODELS.join(
        ", "
      )})?`,
    };
  }
  if (!LEGO_MODELS.includes(legoModel)) {
    return {
      isValid: false,
      invalidSlotName: SlotName.LegoModel,
      message: `Please select ${LEGO_MODELS.join(", ")}`,
    };
  }

  return { isValid: true };
}

function extractSlotValue(slots: LexV2Slots, slotName: string): string | null {
  const slot = slots[slotName];
  return !slot ? null : slot.value.originalValue.toLowerCase();
}

function buildElicitSlotResponse(
  intentName: string,
  slots: LexV2Slots,
  slotNameToElicit: string,
  message?: string
): LexV2Result {
  return {
    sessionState: {
      dialogAction: {
        type: "ElicitSlot",
        slotToElicit: slotNameToElicit,
      },
      intent: {
        name: intentName,
        slots,
        state: "InProgress",
      },
    },
    ...(message
      ? { messages: [{ contentType: "PlainText", content: message }] }
      : {}),
  };
}

function buildDelegateResponse(
  intentName: string,
  slots: LexV2Slots
): LexV2Result {
  return {
    sessionState: {
      dialogAction: {
        type: "Delegate",
      },
      intent: {
        name: intentName,
        slots,
        state: "InProgress",
      },
    },
  };
}

function buildFulfillmentResponse(
  intentName: string,
  slots: LexV2Slots,
  message: string
): LexV2Result {
  return {
    sessionState: {
      dialogAction: {
        type: "Close",
      },
      intent: {
        name: intentName,
        slots,
        state: "Fulfilled",
      },
    },
    messages: [{ contentType: "PlainText", content: message }],
  };
}

async function saveOrder(slots: LexV2Slots) {
  const id = uuidv4();
  const legoSize = extractSlotValue(slots, SlotName.LegoSize) as string;
  const legoModel = extractSlotValue(slots, SlotName.LegoModel) as string;

  const item: DynamoDBItem = {
    id: {
      S: id,
    },
    lego_size: { S: legoSize },
    lego_model: { S: legoModel },
  };

  await dynamodbClient.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );
}
