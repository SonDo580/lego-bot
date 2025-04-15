import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lex from "aws-cdk-lib/aws-lex";
import * as iam from "aws-cdk-lib/aws-iam";

export class LegoBotWithCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const localeId = "en_US";

    const botRuntimeRole = new iam.Role(this, "BotRuntimeRole", {
      assumedBy: new iam.ServicePrincipal("lexv2.amazonaws.com"),
      inlinePolicies: {
        LexRuntimeRolePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["polly:SynthesizeSpeech", "comprehend:DetectSentiment"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    const legoBot = new lex.CfnBot(this, "LegoBot", {
      name: `LegoBot-${this.stackName}`,
      roleArn: botRuntimeRole.roleArn,
      dataPrivacy: {
        ChildDirected: false,
      },
      idleSessionTtlInSeconds: 300,
      autoBuildBotLocales: false,
      botLocales: [
        {
          localeId,
          nluConfidenceThreshold: 0.4,
          voiceSettings: {
            voiceId: "Ivy",
          },
          slotTypes: [
            {
              name: "LegoSizes",
              slotTypeValues: [
                { sampleValue: { value: "small" } },
                { sampleValue: { value: "medium" } },
                { sampleValue: { value: "large" } },
              ],
              valueSelectionSetting: {
                resolutionStrategy: "ORIGINAL_VALUE",
              },
            },
            {
              name: "LegoModels",
              slotTypeValues: [
                { sampleValue: { value: "ship" } },
                { sampleValue: { value: "tank" } },
                { sampleValue: { value: "rocket" } },
              ],
              valueSelectionSetting: {
                resolutionStrategy: "ORIGINAL_VALUE",
              },
            },
          ],
          intents: [
            {
              name: "OrderLego",
              sampleUtterances: [
                { utterance: "Lego" },
                { utterance: "I'd like to order a lego" },
                { utterance: "I want a {LegoSize} lego" },
                { utterance: "I want a {LegoModel} lego" },
                { utterance: "I want a {LegoSize} {LegoModel} lego" },
              ],
              intentConfirmationSetting: {
                promptSpecification: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value:
                            "Would you like me to order your {LegoSize} {LegoModel}?",
                        },
                      },
                    },
                  ],
                  maxRetries: 3,
                  allowInterrupt: false,
                },
                declinationResponse: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value: "Good luck finding it yourself.",
                        },
                      },
                    },
                  ],
                  allowInterrupt: false,
                },
              },
              slots: [
                {
                  name: "LegoSize",
                  slotTypeName: "LegoSizes",
                  valueElicitationSetting: {
                    slotConstraint: "Required",
                    promptSpecification: {
                      messageGroupsList: [
                        {
                          message: {
                            plainTextMessage: {
                              value: "Which lego size do you want?",
                            },
                          },
                        },
                      ],
                      maxRetries: 3,
                      allowInterrupt: false,
                    },
                  },
                },
                {
                  name: "LegoModel",
                  slotTypeName: "LegoModels",
                  valueElicitationSetting: {
                    slotConstraint: "Required",
                    promptSpecification: {
                      messageGroupsList: [
                        {
                          message: {
                            plainTextMessage: {
                              value: "Which lego model do you want?",
                            },
                          },
                        },
                      ],
                      maxRetries: 3,
                      allowInterrupt: false,
                    },
                  },
                },
              ],
              slotPriorities: [
                {
                  priority: 1,
                  slotName: "LegoModel",
                },
                {
                  priority: 2,
                  slotName: "LegoSize",
                },
              ],
            },
            {
              name: "FallbackIntent",
              parentIntentSignature: "AMAZON.FallbackIntent",
              intentClosingSetting: {
                closingResponse: {
                  messageGroupsList: [
                    {
                      message: {
                        plainTextMessage: {
                          value: "Sorry, I can't help you with that.",
                        },
                      },
                    },
                  ],
                  allowInterrupt: false,
                },
              },
            },
          ],
        },
      ],
    });

    const legoBotVersion = new lex.CfnBotVersion(this, "LegoBotVersion", {
      botId: legoBot.ref,
      botVersionLocaleSpecification: [
        {
          localeId,
          botVersionLocaleDetails: {
            sourceBotVersion: "DRAFT",
          },
        },
      ],
    });

    new lex.CfnBotAlias(this, "LegoBotAlias", {
      botAliasName: "LegoBotVersion1Alias",
      botId: legoBot.ref,
      botVersion: legoBotVersion.attrBotVersion,
      botAliasLocaleSettings: [
        {
          localeId,
          botAliasLocaleSetting: {
            enabled: true,
          },
        },
      ],
    });
  }
}
