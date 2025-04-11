import os
import boto3
import uuid
import logging

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

dynamodb_client = boto3.client("dynamodb")
TABLE_NAME = os.environ["TABLE_NAME"]

LEGO_SIZES = ["small", "medium", "large"]
LEGO_MODELS = ["ship", "tank", "rocket"]


class Slot:
    LegoSize = "LegoSize"
    LegoModel = "LegoModel"


def __extract_slot_value(slots, slot_name):
    slot = slots.get(slot_name)
    if not slot:
        return None
    return slot["value"]["originalValue"].lower()


def __build_validation_result(is_valid, invalid_slot=None, message=None):
    result = {"isValid": is_valid}
    if invalid_slot:
        result["invalidSlot"] = invalid_slot
    if message:
        result["message"] = message
    return result


def __validate_order(slots):
    lego_size = __extract_slot_value(slots, slot_name=Slot.LegoSize)
    if not lego_size:
        logger.debug(f"Missing {Slot.LegoSize} slot.")
        return __build_validation_result(is_valid=False, invalid_slot=Slot.LegoSize)
    if lego_size not in LEGO_SIZES:
        logger.debug(f"Invalid {Slot.LegoSize}: {lego_size}")
        return __build_validation_result(
            is_valid=False,
            invalid_slot=Slot.LegoSize,
            message=f"Please select {', '.join(LEGO_SIZES)}",
        )

    lego_model = __extract_slot_value(slots, slot_name=Slot.LegoModel)
    if not lego_model:
        logger.debug(f"Missing {Slot.LegoModel} slot.")
        return __build_validation_result(is_valid=False, invalid_slot=Slot.LegoModel)
    if lego_model not in LEGO_MODELS:
        logger.debug(f"Invalid {Slot.LegoModel}: {lego_model}")
        return __build_validation_result(
            is_valid=False,
            invalid_slot=Slot.LegoModel,
            message=f"Please select {', '.join(LEGO_MODELS)}",
        )

    logger.debug("Order validation passed.")
    return __build_validation_result(True)


def __save_order(slots):
    id = str(uuid.uuid4())
    lego_size = __extract_slot_value(slots, slot_name=Slot.LegoSize)
    lego_model = __extract_slot_value(slots, slot_name=Slot.LegoModel)

    string_type = "S"
    item = {
        "id": {string_type: id},
        "lego_size": {string_type: lego_size},
        "lego_model": {string_type: lego_model},
    }

    dynamodb_client.put_item(TableName=TABLE_NAME, Item=item)
    logger.info(f"Order {id} saved to DynamoDB")


def __build_elicit_slot_response(intent_name, slots, slot_to_elicit, message=None):
    response = {
        "sessionState": {
            "dialogAction": {
                "type": "ElicitSlot",
                "slotToElicit": slot_to_elicit,
            },
            "intent": {
                "name": intent_name,
                "slots": slots,
            },
        }
    }

    if message:
        response["messages"] = [
            {
                "contentType": "PlainText",
                "content": message,
            }
        ]

    return response


def __build_delegate_response(intent_name, slots):
    return {
        "sessionState": {
            "dialogAction": {
                "type": "Delegate",
            },
            "intent": {"name": intent_name, "slots": slots},
        }
    }


def __build_fulfillment_response(intent_name, slots, message):
    return {
        "sessionState": {
            "dialogAction": {
                "type": "Close",
            },
            "intent": {
                "name": intent_name,
                "slots": slots,
                "state": "Fulfilled",
            },
        },
        "messages": [
            {
                "contentType": "PlainText",
                "content": message,
            }
        ],
    }


def lambda_handler(event, context):
    logger.debug(f"Received event: {event}")

    intent = event["sessionState"]["intent"]
    intent_name = intent["name"]
    slots = intent["slots"]
    invocation_source = event["invocationSource"]

    if invocation_source == "DialogCodeHook":
        order_validation_result = __validate_order(slots)

        if not order_validation_result["isValid"]:
            logger.debug(f"Validation failed: {order_validation_result}")
            return __build_elicit_slot_response(
                intent_name,
                slots,
                slot_to_elicit=order_validation_result["invalidSlot"],
                message=order_validation_result.get("message"),
            )
        else:
            logger.debug("Validation passed, delegating to Lex.")
            return __build_delegate_response(intent_name, slots)

    elif invocation_source == "FulfillmentCodeHook":
        __save_order(slots)

        return __build_fulfillment_response(
            intent_name, slots, message="I've placed your order"
        )
