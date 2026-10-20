/** Credit ledger reason → display label, shared by the profile ledger and the admin ledger. */
export function creditReasonLabel(reason?: string | null) {
  switch (reason) {
    case "signup":
      return "注册奖励";
    case "checkin":
      return "每日签到";
    case "invite":
      return "邀请奖励";
    case "card_redeem":
      return "卡密兑换";
    case "image_generation":
      return "图片生成";
    case "image_edit":
      return "图片编辑";
    case "image_refund":
      return "图片返还";
    case "video_generation":
      return "视频生成";
    case "video_refund":
      return "视频返还";
    default:
      return reason || "积分变动";
  }
}
