<?php
/**
 * File: index.php
 * Description: StraboMicro Viewer Login Helper
 *
 * @package    StraboSpot Web Site
 * @author     Jason Ash <jasonash@ku.edu>
 * @copyright  2025 StraboSpot
 * @license    https://opensource.org/licenses/MIT MIT License
 * @link       https://strabospot.org
 */

include("../prepare_connections.php");

SESSION_START();

$userpkey = $_SESSION['userpkey'];
if($userpkey == "") $userpkey = 999999;

// Upload-stable permalink support (www: microdb/lib/permalink.php).
// Preferred form: ?m=<slug>. Legacy form: ?p=<pkey> (still honored).
require_once(__DIR__ . '/../microdb/lib/permalink.php');

$m = isset($_GET['m']) ? strtolower(trim($_GET['m'])) : '';
$id = isset($_GET['p']) ? (int)$_GET['p'] : 0;

if($m !== ''){
	$resolved = micro_permalink_resolve($db, $m);
	$id = ($resolved !== null) ? (int)$resolved->id : 0;
}

$row = $db->get_row_prepared("select * from micro_projectmetadata where id = $1 and (ispublic or userpkey=$2)", array($id, $userpkey));

if($row->id == ""){
	echo "Error! Project not found.";
	exit();
}

// Tier self-heal: this viewer needs a tiles/ dir. If a later upload moved
// the project off the tiles tier, bounce through the front door to re-route.
if($m !== '' && !is_dir($_SERVER['DOCUMENT_ROOT']."/straboMicroFiles/$id/tiles")){
	header("Location: /microproject?m=$m");
	exit();
}

// Legacy pkey arrival: mint the slug so the address bar upgrades to the
// upload-stable form via the replaceState injection below.
if($m === ''){
	$slug = micro_permalink_get_or_create($db, $row->strabo_id, (int)$row->userpkey);
	if($slug !== null) $m = $slug;
}

// Refresh the static ./smzFiles/<id>/project.json (which the viewer JS fetches
// client-side) with the strabosamples spine overlay if a Samples-app edit
// dirtied it, before the page's JS reads it. Mirrors straboMicroView/view.php.
// Owner is $row->userpkey (the project owner). No-op when clean or when the
// per-project static dir isn't present.
require_once(__DIR__ . '/../microdb/lib/sample_overlay.php');
micro_regenerate_files_if_dirty($db, (int)$id, (int)$row->userpkey);


if($m !== ''){
	// Keep the permalink in the address bar while exposing the current pkey
	// as ?p= for the viewer bundle. The bundle's script tag is type="module"
	// (deferred by spec), so this inline body script always runs before the
	// app reads window.location.search.
	$html = file_get_contents(__DIR__ . "/microviewer.html");
	$inject = "<script>history.replaceState(null, '', '/microview/?m=$m&p=$id');</script>";
	echo preg_replace('/<body([^>]*)>/', '<body$1>' . "\n    " . $inject, $html, 1);
}else{
	include("microviewer.html");
}
