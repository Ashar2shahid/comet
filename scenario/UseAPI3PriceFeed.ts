import { scenario } from "./context/CometContext";
import { expect } from "chai";
import { utils } from "ethers";
import { exp } from "../test/helpers";
import { calldata } from "../src/deploy";
import { impersonateAddress } from "../plugins/scenario/utils";
import { BaseBridgeReceiver, LineaBridgeReceiver, ScrollBridgeReceiver } from "../build/types";
import { isBridgedDeployment, matchesDeployment, createCrossChainProposal } from "./utils";
import { ArbitrumBridgeReceiver } from "../build/types";

const WSTETH_ADDRESS = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WEETH_ADDRESS = "0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe";

const WSTETH_STETH_PRICE_FEED_ADDRESS = "0xB1552C5e96B312d0Bf8b554186F846C40614a540";
const STETH_ETH_PRICE_FEED_ADDRESS = "0xded2c52b75B24732e9107377B7Ba93eC1fFa4BAf";
const STETH_USD_PRICE_FEED_ADDRESS = "0x07C5b924399cc23c24a95c8743DE4006a32b7f2a";

const WEETH_EETH_PRICE_FEED_ADDRESS = "0x20bAe7e1De9c596f5F7615aeaa1342Ba99294e12";

const USDT_COMET_ADDRESS = "0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07";
const USDC_COMET_ADDRESS = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";

let newWstETHToETHPriceFeed: string;
let newWeETHToETHPriceFeed: string;
let newWstETHToUSDPriceFeed: string;

scenario.only(
  "upgrade arbitrum price feeds and ensure they work properly",
  {
    filter: async (ctx) => matchesDeployment(ctx, [{ network: "arbitrum", deployment: 'usdc' }]),
  },
  async (
    { comet, configurator, proxyAdmin, timelock: oldLocalTimelock, bridgeReceiver: oldBridgeReceiver },
    context,
    world
  ) => {
    const dm = world.deploymentManager;
    const governanceDeploymentManager = world.auxiliaryDeploymentManager;

    const wstETHToUSDPriceFeed = await dm.deploy(
      "wstETH:priceFeed",
      "pricefeeds/MultiplicativePriceFeed.sol",
      [
        WSTETH_STETH_PRICE_FEED_ADDRESS, // wstETH / stETH price feed
        STETH_USD_PRICE_FEED_ADDRESS, // stETH / USD price feed
        8, // decimals
        "wstETH / USD price feed", // description
      ],
      true
    );

    console.log("wstETHToUSDPriceFeed", wstETHToUSDPriceFeed.address);

    const wstETHToETHPriceFeed = await dm.deploy(
      "wstETH:priceFeed",
      "pricefeeds/MultiplicativePriceFeed.sol",
      [
        WSTETH_STETH_PRICE_FEED_ADDRESS, // wstETH / stETH price feed
        STETH_ETH_PRICE_FEED_ADDRESS, // stETH / ETH price feed
        8, // decimals
        "wstETH / WETH price feed", // description
      ],
      true
    );

    console.log("wstETHToETHPriceFeed", wstETHToETHPriceFeed.address);

    const weETHToETHPriceFeed = await dm.deploy(
      "weETH:priceFeed",
      "pricefeeds/ScalingPriceFeed.sol",
      [
        WEETH_EETH_PRICE_FEED_ADDRESS, // weETH / eETH price feed
        8, // decimals
      ],
      true
    );

    console.log("weETHToETHPriceFeed", weETHToETHPriceFeed.address);

    const wstETH = await dm.existing("wstETH", WSTETH_ADDRESS, "arbitrum", "contracts/ERC20.sol:ERC20");

    const weETH = await dm.existing("weETH", WEETH_ADDRESS, "arbitrum", "contracts/ERC20.sol:ERC20");

    const updateAssetPriceFeedCalldataWstETHToWETHComet = utils.defaultAbiCoder.encode(
      ["address", "address", "address"],
      [comet.address, wstETH.address, wstETHToETHPriceFeed.address]
    );

    const updateAssetPriceFeedCalldataWeETHToWETHComet = utils.defaultAbiCoder.encode(
      ["address", "address", "address"],
      [comet.address, weETH.address, weETHToETHPriceFeed.address]
    );

    const updateAssetPriceFeedCalldataWstETHToUSDTComet = utils.defaultAbiCoder.encode(
      ["address", "address", "address"],
      [USDT_COMET_ADDRESS, wstETH.address, wstETHToUSDPriceFeed.address]
    );

    const updateAssetPriceFeedCalldataWstETHToUSDCComet = utils.defaultAbiCoder.encode(
      ["address", "address", "address"],
      [USDC_COMET_ADDRESS, wstETH.address, wstETHToUSDPriceFeed.address]
    );

    const deployAndUpgradeToCalldataWETHComet = utils.defaultAbiCoder.encode(
      ["address", "address"],
      [configurator.address, comet.address]
    );

    const deployAndUpgradeToCalldataUSDCComet = utils.defaultAbiCoder.encode(
      ["address", "address"],
      [configurator.address, USDC_COMET_ADDRESS]
    );

    const deployAndUpgradeToCalldataUSDTComet = utils.defaultAbiCoder.encode(
      ["address", "address"],
      [configurator.address, USDT_COMET_ADDRESS]
    );

    const { bridgeReceiver, timelock: l2Timelock, _comet, cometAdmin, _configurator } = await dm.getContracts();

    const l2ProposalData = utils.defaultAbiCoder.encode(
      ["address[]", "uint256[]", "string[]", "bytes[]"],
      [
        [
          configurator.address,
          configurator.address,
          configurator.address,
          configurator.address,
          cometAdmin.address,
          cometAdmin.address,
          cometAdmin.address,
        ],
        [0, 0, 0, 0, 0, 0, 0],
        [
          "updateAssetPriceFeed(address,address,address)",
          "updateAssetPriceFeed(address,address,address)",
          "updateAssetPriceFeed(address,address,address)",
          "updateAssetPriceFeed(address,address,address)",
          "deployAndUpgradeTo(address,address)",
          "deployAndUpgradeTo(address,address)",
          "deployAndUpgradeTo(address,address)",
        ],
        [
          updateAssetPriceFeedCalldataWstETHToWETHComet,
          updateAssetPriceFeedCalldataWeETHToWETHComet,
          updateAssetPriceFeedCalldataWstETHToUSDCComet,
          updateAssetPriceFeedCalldataWstETHToUSDTComet,
          deployAndUpgradeToCalldataWETHComet,
          deployAndUpgradeToCalldataUSDCComet,
          deployAndUpgradeToCalldataUSDTComet,
        ],
      ]
    );

    await createCrossChainProposal(context, l2ProposalData, oldBridgeReceiver);
  }
);
